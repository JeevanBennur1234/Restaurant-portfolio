import * as crypto from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, like } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";
import { env } from "../src/server/env";

function detectImageMagicBytes(buffer: Buffer): { ext: "jpg" | "png" | "webp"; contentType: "image/jpeg" | "image/png" | "image/webp" } | null {
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

async function resizeImageIfNeeded(buffer: Buffer): Promise<Buffer> {
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

async function migrateDataUrls() {
  console.log("🔍 Checking for menu_items with data: URLs...");

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl:
      env.DATABASE_URL.includes("supabase.co") ||
      env.DATABASE_URL.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
  });
  const db = drizzle(pool, { schema });

  try {
    const itemsWithDataUrl = await db
      .select({
        id: schema.menuItems.id,
        name: schema.menuItems.name,
        imageUrl: schema.menuItems.imageUrl,
      })
      .from(schema.menuItems)
      .where(like(schema.menuItems.imageUrl, "data:%"));

    console.log(`Found ${itemsWithDataUrl.length} menu items with data: URLs.`);

    if (itemsWithDataUrl.length === 0) {
      console.log("✅ No data: URLs found. Nothing to migrate.");
      return;
    }

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey || supabaseUrl.includes("placeholder") || serviceKey.includes("placeholder")) {
      console.error("❌ Supabase storage credentials not configured. Migration aborted.");
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Ensure bucket exists
    const { error: createBucketError } = await supabase.storage.createBucket("menu-images", {
      public: true,
    });
    if (createBucketError && !createBucketError.message?.toLowerCase().includes("already exists")) {
      console.warn("Notice when checking/creating bucket:", createBucketError.message);
    }

    let migratedCount = 0;

    for (const item of itemsWithDataUrl) {
      if (!item.imageUrl) continue;

      try {
        const matches = item.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          console.warn(`⚠️ Skipping item ${item.name} (${item.id}): Invalid data URL format.`);
          continue;
        }

        const [, mimeType, base64Data] = matches;
        const rawBuffer = Buffer.from(base64Data, "base64");

        const detected = detectImageMagicBytes(rawBuffer) || {
          ext: mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg",
          contentType: (mimeType as "image/jpeg" | "image/png" | "image/webp") || "image/jpeg",
        };

        const processedBuffer = await resizeImageIfNeeded(rawBuffer);
        const fileName = `${crypto.randomUUID()}.${detected.ext}`;

        const { error: uploadError } = await supabase.storage
          .from("menu-images")
          .upload(fileName, processedBuffer, {
            contentType: detected.contentType,
            upsert: false,
          });

        if (uploadError) {
          console.error(`❌ Failed to upload image for ${item.name}:`, uploadError.message);
          continue;
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/menu-images/${fileName}`;

        await db
          .update(schema.menuItems)
          .set({ imageUrl: publicUrl, updatedAt: new Date() })
          .where(eq(schema.menuItems.id, item.id));

        console.log(`✅ Migrated [${item.name}] -> ${publicUrl}`);
        migratedCount++;
      } catch (err) {
        console.error(`❌ Error migrating item ${item.name} (${item.id}):`, err);
      }
    }

    console.log(`🎉 Successfully migrated ${migratedCount} of ${itemsWithDataUrl.length} items.`);
  } finally {
    await pool.end();
  }
}

migrateDataUrls().catch((err) => {
  console.error("Migration failed with fatal error:", err);
  process.exit(1);
});
