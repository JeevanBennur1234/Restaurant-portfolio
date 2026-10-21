import * as fs from "node:fs";
import * as path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";
import { env } from "../src/server/env";
import { poolConfig } from "../src/server/db/pool-config";

export interface ImageAuditStatus {
  id: string;
  name: string;
  imageUrl: string;
  isRemote: boolean;
  localPath: string | null;
  localExists: boolean;
  remoteAvailable: boolean | null;
  status: "OK" | "MISSING_LOCAL" | "MISSING_REMOTE" | "UNAVAILABLE";
}

/**
 * Detect image format from magic bytes for safety validation
 */
function detectMagicBytes(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export async function auditAndSyncMenuImages(options: {
  uploadToSupabase?: boolean;
  dryRun?: boolean;
} = {}): Promise<{
  totalCount: number;
  availableCount: number;
  missingCount: number;
  items: ImageAuditStatus[];
  actionsTaken: string[];
}> {
  const rootDir = process.cwd();
  const pool = new Pool(poolConfig);
  const db = drizzle(pool, { schema });
  const actionsTaken: string[] = [];

  try {
    const items = await db.select().from(schema.menuItems);
    const results: ImageAuditStatus[] = [];

    let supabaseClient: ReturnType<typeof createClient> | null = null;
    if (env.NEXT_PUBLIC_SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      supabaseClient = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }

    // Existing files in Supabase menu-images bucket
    const bucketFiles = new Set<string>();
    if (supabaseClient) {
      try {
        const { data } = await supabaseClient.storage.from("menu-images").list();
        if (data) {
          for (const f of data) bucketFiles.add(f.name);
        }
      } catch {
        // bucket listing error handled gracefully
      }
    }

    for (const item of items) {
      const rawUrl = item.imageUrl ?? "";
      const isRemote = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
      let localPath: string | null = null;
      let localExists = false;
      let remoteAvailable: boolean | null = null;

      if (!isRemote && rawUrl.startsWith("/")) {
        localPath = path.join(rootDir, "public", rawUrl.slice(1));
        localExists = fs.existsSync(localPath);
      } else if (!isRemote && rawUrl) {
        localPath = path.join(rootDir, "public", rawUrl);
        localExists = fs.existsSync(localPath);
      } else if (isRemote) {
        // Check if there is an equivalent local asset by slug/name
        const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const candidate1 = path.join(rootDir, "public", "images", "dishes", `${slug}.webp`);
        const candidate2 = path.join(rootDir, "public", "images", "dishes", `${slug}.jpg`);
        if (fs.existsSync(candidate1)) {
          localPath = candidate1;
          localExists = true;
        } else if (fs.existsSync(candidate2)) {
          localPath = candidate2;
          localExists = true;
        }

        // Check remote reachability
        try {
          const res = await fetch(rawUrl, { method: "HEAD" });
          remoteAvailable = res.ok;
        } catch {
          remoteAvailable = false;
        }
      }

      let status: ImageAuditStatus["status"] = "OK";
      if (!isRemote && !localExists) {
        status = "MISSING_LOCAL";
      } else if (isRemote && remoteAvailable === false) {
        status = "UNAVAILABLE";
      }

      results.push({
        id: item.id,
        name: item.name,
        imageUrl: rawUrl,
        isRemote,
        localPath,
        localExists,
        remoteAvailable,
        status,
      });

      // Optional upload to Supabase Storage with duplicate protection
      if (options.uploadToSupabase && supabaseClient && localExists && localPath) {
        const fileBytes = fs.readFileSync(localPath);
        const format = detectMagicBytes(fileBytes);
        if (format) {
          const fileName = `${path.basename(localPath, path.extname(localPath))}.${format}`;
          if (!bucketFiles.has(fileName)) {
            if (!options.dryRun) {
              const contentType = format === "jpg" ? "image/jpeg" : `image/${format}`;
              const { error: uploadErr } = await supabaseClient.storage
                .from("menu-images")
                .upload(fileName, fileBytes, {
                  contentType,
                  upsert: false,
                });
              if (!uploadErr) {
                bucketFiles.add(fileName);
                actionsTaken.push(`Uploaded ${fileName} to Supabase menu-images bucket`);
              }
            } else {
              actionsTaken.push(`[DRY-RUN] Would upload ${fileName} to Supabase menu-images bucket`);
            }
          }
        }
      }
    }

    const availableCount = results.filter((r) => r.status === "OK").length;
    const missingCount = results.length - availableCount;

    await pool.end();
    return {
      totalCount: results.length,
      availableCount,
      missingCount,
      items: results,
      actionsTaken,
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const uploadToSupabase = process.argv.includes("--upload-to-supabase");

  console.log(`🖼️  Auditing menu item dish images (dryRun=${isDryRun}, upload=${uploadToSupabase})...\n`);
  const report = await auditAndSyncMenuImages({ uploadToSupabase, dryRun: isDryRun });

  console.log(`Total dishes: ${report.totalCount}`);
  console.log(`Available & valid: ${report.availableCount}`);
  console.log(`Issues / missing: ${report.missingCount}\n`);

  for (const item of report.items) {
    const icon = item.status === "OK" ? "✅" : "❌";
    console.log(`${icon} [${item.status}] ${item.name}: ${item.imageUrl}`);
    if (item.localPath) {
      console.log(`   Local file: ${item.localPath} (exists: ${item.localExists})`);
    }
  }

  if (report.actionsTaken.length > 0) {
    console.log("\nActions taken:");
    for (const a of report.actionsTaken) console.log(` - ${a}`);
  }
}

if (require.main === module || process.argv[1]?.includes("sync-menu-images")) {
  main().catch((err) => {
    console.error("Audit/sync failed:", err);
    process.exit(1);
  });
}
