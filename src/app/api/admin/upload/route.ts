import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getStaffSession } from "@/server/auth";
import { env } from "@/server/env";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface DetectedImage {
  ext: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

/**
 * Validates real file type from magic bytes:
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47
 * - WebP: RIFF....WEBP (RIFF at 0..3, WEBP at 8..11)
 */
export function detectImageMagicBytes(buffer: Buffer): DetectedImage | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: "png", contentType: "image/png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }

  return null;
}

/**
 * Resizes image to max 1600px dimension if sharp is available, otherwise returns buffer as-is.
 */
export async function resizeImageIfNeeded(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer)
      .resize(1600, 1600, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
  } catch {
    return buffer;
  }
}

export async function POST(request: NextRequest) {
  // 1. Role Guard: Manager or Admin only
  const session = await getStaffSession();
  if (!session || (session.role !== "manager" && session.role !== "admin")) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Manager session required" },
      { status: 401 }
    );
  }

  // Demo account guard: Production must always reject demo accounts.
  // Outside production, demo uploads can only proceed if explicitly enabled via ALLOW_LOCAL_DEMO_UPLOADS=true.
  const isProduction = env.NODE_ENV === "production";
  const allowLocalDemoUpload = !isProduction && env.ALLOW_LOCAL_DEMO_UPLOADS === "true";

  if (session.isDemo && !allowLocalDemoUpload) {
    return NextResponse.json(
      {
        success: false,
        error: isProduction
          ? "Demo accounts cannot upload images in production."
          : "Demo accounts cannot upload images.",
      },
      { status: 403 }
    );
  }

  // 2. Storage credentials check: strictly requires server-side SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceKey ||
    supabaseUrl.includes("placeholder") ||
    serviceKey.includes("placeholder")
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Storage service is not configured. Server-side SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required.",
      },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: "No image file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "File is too large. Maximum image size is 5MB.",
        },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // 3. Validate real file type via magic bytes (not trusting file.type header)
    const detected = detectImageMagicBytes(rawBuffer);
    if (!detected) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file format. Only JPEG, PNG, and WebP images are supported.",
        },
        { status: 400 }
      );
    }

    // 4. Resize to max 1600px if sharp available
    const processedBuffer = await resizeImageIfNeeded(rawBuffer);

    // 5. Generate collision-safe server filename (uuid + extension from detected type)
    const fileName = `${crypto.randomUUID()}.${detected.ext}`;

    // 6. Upload directly to Supabase Storage "menu-images" bucket using service role key
    const supabase = createClient(supabaseUrl, serviceKey);

    const { error: uploadError } = await supabase.storage
      .from("menu-images")
      .upload(fileName, processedBuffer, {
        contentType: detected.contentType,
        upsert: false,
      });

    if (uploadError) {
      const isBucketMissing =
        uploadError.message?.toLowerCase().includes("not found") ||
        uploadError.message?.toLowerCase().includes("does not exist") ||
        (uploadError as unknown as { statusCode?: string }).statusCode === "404";

      if (isBucketMissing) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Storage bucket 'menu-images' not found. Please create the public bucket 'menu-images' in your Supabase project dashboard.",
          },
          { status: 500 }
        );
      }

      console.error("Storage upload failed:", uploadError.message);
      return NextResponse.json(
        { success: false, error: uploadError.message || "Failed to upload image" },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("menu-images")
      .getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      fileName,
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to process image upload",
      },
      { status: 500 }
    );
  }
}
