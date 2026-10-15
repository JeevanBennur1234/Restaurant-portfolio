import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { isValidImageUrl } from "@/lib/validations/admin";

const { mockUpload, mockStorageFrom } = vi.hoisted(() => {
  const mockUpload = vi.fn().mockResolvedValue({ data: { path: "test.jpg" }, error: null });
  const mockGetPublicUrl = vi.fn((fileName: string) => ({
    data: { publicUrl: `https://xyzcompany.supabase.co/storage/v1/object/public/menu-images/${fileName}` },
  }));
  const mockStorageFrom = vi.fn(() => ({
    upload: mockUpload,
    getPublicUrl: mockGetPublicUrl,
  }));
  return { mockUpload, mockGetPublicUrl, mockStorageFrom };
});

const mockStaffSession = vi.hoisted(() => ({
  value: {
    userId: "staff-1",
    role: "manager" as const,
    restaurantId: "rest-1",
    restaurantName: "Masala Lane",
    username: "manager1",
    isDemo: false,
  } as {
    userId: string;
    role: "kitchen" | "manager" | "admin";
    restaurantId: string;
    restaurantName: string;
    username: string;
    isDemo: boolean;
  } | null,
}));

const mockEnv = vi.hoisted(() => ({
  value: {
    NODE_ENV: "test",
    DEMO_MODE: "false",
    ALLOW_LOCAL_DEMO_UPLOADS: "false",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
    NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "real_service_role_key_value",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_key",
  },
}));

vi.mock("@/server/auth", () => ({
  getStaffSession: vi.fn(async () => mockStaffSession.value),
}));

vi.mock("@/server/env", () => ({
  get env() {
    return mockEnv.value;
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: mockStorageFrom,
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
      restaurantName: "Masala Lane",
      username: "manager1",
      isDemo: false,
    };
    mockEnv.value = {
      NODE_ENV: "test",
      DEMO_MODE: "false",
      ALLOW_LOCAL_DEMO_UPLOADS: "false",
      DATABASE_URL: "postgres://mock",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
      NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "real_service_role_key_value",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_key",
    };
    mockUpload.mockResolvedValue({ data: { path: "test.jpg" }, error: null });
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

  describe("POST /api/admin/upload route handler - Authentication & Authorization", () => {
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
        restaurantName: "Masala Lane",
        username: "kitchen1",
        isDemo: false,
      };

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("rejects demo accounts with 403 when ALLOW_LOCAL_DEMO_UPLOADS is false", async () => {
      mockStaffSession.value = {
        userId: "staff-demo",
        role: "manager",
        restaurantId: "rest-1",
        restaurantName: "Masala Lane",
        username: "manager_demo",
        isDemo: true,
      };
      mockEnv.value.ALLOW_LOCAL_DEMO_UPLOADS = "false";

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/Demo accounts cannot upload images/i);
    });

    it("strictly rejects demo accounts in production even if ALLOW_LOCAL_DEMO_UPLOADS is true", async () => {
      mockStaffSession.value = {
        userId: "staff-demo",
        role: "manager",
        restaurantId: "rest-1",
        restaurantName: "Masala Lane",
        username: "manager_demo",
        isDemo: true,
      };
      mockEnv.value.NODE_ENV = "production";
      mockEnv.value.ALLOW_LOCAL_DEMO_UPLOADS = "true";

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/production/i);
    });

    it("allows demo accounts in non-production when ALLOW_LOCAL_DEMO_UPLOADS is explicitly true", async () => {
      mockStaffSession.value = {
        userId: "staff-demo",
        role: "manager",
        restaurantId: "rest-1",
        restaurantName: "Masala Lane",
        username: "manager_demo",
        isDemo: true,
      };
      mockEnv.value.NODE_ENV = "development";
      mockEnv.value.ALLOW_LOCAL_DEMO_UPLOADS = "true";

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
    });

    it("allows non-demo manager (isDemo = false) without ALLOW_LOCAL_DEMO_UPLOADS", async () => {
      mockStaffSession.value = {
        userId: "staff-owner",
        role: "manager",
        restaurantId: "rest-1",
        restaurantName: "Masala Lane",
        username: "owner",
        isDemo: false,
      };
      mockEnv.value.ALLOW_LOCAL_DEMO_UPLOADS = "false";

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
    });
  });

  describe("POST /api/admin/upload route handler - File Validation & Storage Handling", () => {
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

    it("returns 500 when SUPABASE_SERVICE_ROLE_KEY is missing on server", async () => {
      mockEnv.value.SUPABASE_SERVICE_ROLE_KEY = "";

      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const blob = new Blob([jpegBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.set("file", blob, "dish.jpg");

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    });

    it("returns descriptive 500 without silently creating bucket when menu-images bucket is not found", async () => {
      mockUpload.mockResolvedValueOnce({
        data: null,
        error: { message: "Bucket not found", statusCode: "404" },
      });

      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const blob = new Blob([jpegBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.set("file", blob, "dish.jpg");

      const req = new NextRequest("http://localhost:3000/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toMatch(/Storage bucket 'menu-images' not found/i);
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

  describe("isValidImageUrl validation helper", () => {
    it("accepts valid relative image paths", () => {
      expect(isValidImageUrl("/images/hero.jpg").valid).toBe(true);
      expect(isValidImageUrl("/images/dishes/tikka.png").valid).toBe(true);
      expect(isValidImageUrl("/uploads/dish.webp").valid).toBe(true);
    });

    it("accepts valid supported remote image hosts with image extensions or paths", () => {
      expect(isValidImageUrl("https://images.unsplash.com/photo-123").valid).toBe(true);
      expect(isValidImageUrl("https://plus.unsplash.com/premium_photo-456").valid).toBe(true);
      expect(isValidImageUrl("https://res.cloudinary.com/demo/image/upload/sample.jpg").valid).toBe(true);
      expect(isValidImageUrl("https://images.pexels.com/photos/123/pexels-photo-123.jpeg").valid).toBe(true);
      expect(isValidImageUrl("https://img.freepik.com/free-photo/biryani_123.jpg").valid).toBe(true);
      expect(isValidImageUrl("https://xyzcompany.supabase.co/storage/v1/object/public/menu-images/dish.webp").valid).toBe(true);
    });

    it("rejects non-image webpage URLs", () => {
      const htmlRes = isValidImageUrl("https://example.com/menu.html");
      expect(htmlRes.valid).toBe(false);
      expect(htmlRes.error).toMatch(/webpage/i);

      const phpRes = isValidImageUrl("https://example.com/index.php");
      expect(phpRes.valid).toBe(false);

      const generalPage = isValidImageUrl("https://wikipedia.org/wiki/Biryani");
      expect(generalPage.valid).toBe(false);
      expect(generalPage.error).toMatch(/image format/i);
    });

    it("rejects unsupported external image hosts (e.g. myfoodstory.com) even with valid image extensions", () => {
      const foodBlogRes = isValidImageUrl("https://myfoodstory.com/wp-content/uploads/2021/08/butter-chicken.jpg");
      expect(foodBlogRes.valid).toBe(false);
      expect(foodBlogRes.error).toMatch(/unsupported remote image host/i);
      expect(foodBlogRes.error).toMatch(/myfoodstory\.com/i);

      const randomCdn = isValidImageUrl("https://random-food-blog.com/images/paneer.png");
      expect(randomCdn.valid).toBe(false);
      expect(randomCdn.error).toMatch(/unsupported remote image host/i);
    });

    it("rejects unsafe URL protocols like javascript or data", () => {
      expect(isValidImageUrl("javascript:alert(1)").valid).toBe(false);
      expect(isValidImageUrl("data:text/html;base64,PHNjcmlwdD4=").valid).toBe(false);
    });

    it("rejects malformed URLs", () => {
      expect(isValidImageUrl("not-a-valid-url").valid).toBe(false);
    });
  });
});
