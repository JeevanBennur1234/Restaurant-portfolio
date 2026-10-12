import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { getStaffSession } from "@/server/auth";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  // 1. Role Guard: Manager or Admin only
  const session = await getStaffSession();
  if (!session || (session.role !== "manager" && session.role !== "admin")) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Manager session required" },
      { status: 401 }
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

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file type. Only JPEG, PNG, and WebP are supported.",
        },
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

    const buffer = Buffer.from(await file.arrayBuffer());

    // Determine extension
    let ext = "jpg";
    if (file.type === "image/png") ext = "png";
    if (file.type === "image/webp") ext = "webp";

    const fileName = `item-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      await fs.mkdir(uploadsDir, { recursive: true });
      const filePath = path.join(uploadsDir, fileName);
      await fs.writeFile(filePath, buffer);

      return NextResponse.json({
        success: true,
        url: `/uploads/${fileName}`,
      });
    } catch (fsErr) {
      console.warn("Local filesystem write failed, using data URL fallback:", (fsErr as Error).message);
      // Data URL fallback ensures reliable previews across all environments
      const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
      return NextResponse.json({
        success: true,
        url: dataUrl,
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to process image upload",
      },
      { status: 500 }
    );
  }
}
