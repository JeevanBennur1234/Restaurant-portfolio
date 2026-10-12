import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockUpload, mockCreateBucket, mockStorageFrom } = vi.hoisted(() => {
  const mockUpload = vi.fn().mockResolvedValue({ data: { path: "test.jpg" }, error: null });
  const mockCreateBucket = vi.fn().mockResolvedValue({ data: {}, error: null });
  const mockGetPublicUrl = vi.fn((fileName: string) => ({
    data: { publicUrl: `https://xyzcompany.supabase.co/storage/v1/object/public/menu-images/${fileName}` },
  }));
  const mockStorageFrom = vi.fn(() => ({
    upload: mockUpload,
    getPublicUrl: mockGetPublicUrl,
  }));
  return { mockUpload, mockCreateBucket, mockStorageFrom };
});

const mockStaffSession = vi.hoisted(() => ({
  value: {
    userId: "staff-1",
    role: "manager",
    restaurantId: "rest-1",
    username: "manager1",
  } as { userId: string; role: string; restaurantId: string; username: string } | null,
}));

vi.mock("@/server/auth", () => ({
  getStaffSession: vi.fn(async () => mockStaffSession.value),
}));

vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DEMO_MODE: "false",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
    NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "real_service_role_key_value",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_key",
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: mockStorageFrom,
      createBucket: mockCreateBucket,
    },
  })),
}));

import {
  POST,
  detectImageMagicBytes,
  resizeImageIfNeeded,
} from "@/app/api/admin/upload/route";

describe("Admin Image Upload Security & Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaffSession.value = {
      userId: "staff-1",
      role: "manager",
      restaurantId: "rest-1",
      username: "manager1",
    };
  });

  describe("detectImageMagicBytes", () => {
    it("identifies valid JPEG magic bytes (FF D8 FF)", () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = detectImageMagicBytes(buffer);
      expect(result).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    });

    it("identifies valid PNG magic bytes (89 50 4E 47)", () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = detectImageMagicBytes(buffer);
      expect(result).toEqual({ ext: "png", contentType: "image/png" });
    });

    it("identifies valid WebP magic bytes (RIFF....WEBP)", () => {
      const buffer = Buffer.concat([
        Buffer.from("RIFF", "latin1"),
        Buffer.from([0x20, 0x00, 0x00, 0x00]),
        Buffer.from("WEBP", "latin1"),
        Buffer.from("VP8 "),
      ]);
      const result = detectImageMagicBytes(buffer);
      expect(result).toEqual({ ext: "webp", contentType: "image/webp" });
    });

    it("rejects spoofed text file with .jpg extension", () => {
      const buffer = Buffer.from("<?php echo 'malicious'; ?>");
      const result = detectImageMagicBytes(buffer);
      expect(result).toBeNull();
    });

    it("rejects empty or truncated buffer", () => {
      expect(detectImageMagicBytes(Buffer.alloc(0))).toBeNull();
      expect(detectImageMagicBytes(Buffer.from([0xff, 0xd8]))).toBeNull();
      expect(detectImageMagicBytes(Buffer.from("RIFF"))).toBeNull();
    });
  });

  describe("resizeImageIfNeeded", () => {
    it("handles buffers without throwing even if invalid image for sharp", async () => {
      const dummy = Buffer.from([0x01, 0x02, 0x03]);
      const res = await resizeImageIfNeeded(dummy);
      expect(res).toBeInstanceOf(Buffer);
    });
  });

  describe("POST /api/admin/upload route handler", () => {
    it("rejects unauthorized users with 401", async () => {
      mockStaffSession.value = null;

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("rejects non-manager staff roles (e.g. kitchen) with 401", async () => {
      mockStaffSession.value = {
        userId: "staff-2",
        role: "kitchen",
        restaurantId: "rest-1",
        username: "kitchen1",
      };

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("rejects request without a file with 400", async () => {
      const formData = new FormData();
      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/No image file provided/i);
    });

    it("rejects files exceeding 5MB limit with 400", async () => {
      const largeBlob = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/jpeg" });
      const formData = new FormData();
      formData.set("file", largeBlob, "huge.jpg");

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/5MB/i);
    });

    it("rejects file with invalid magic bytes (fake image content) with 400", async () => {
      const fakeBlob = new Blob([Buffer.from("malicious executable content")], { type: "image/jpeg" });
      const formData = new FormData();
      formData.set("file", fakeBlob, "shell.jpg");

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Invalid file format/i);
    });

    it("accepts valid JPEG, uploads to Supabase Storage 'menu-images' bucket, and returns public URL", async () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const blob = new Blob([jpegBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.set("file", blob, "dish.jpg");

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.url).toMatch(/^https:\/\/xyzcompany\.supabase\.co\/storage\/v1\/object\/public\/menu-images\/[a-f0-9-]+\.jpg$/);

      expect(mockStorageFrom).toHaveBeenCalledWith("menu-images");
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^[a-f0-9-]+\.jpg$/),
        expect.any(Buffer),
        expect.objectContaining({ contentType: "image/jpeg", upsert: false })
      );
    });
  });
});
