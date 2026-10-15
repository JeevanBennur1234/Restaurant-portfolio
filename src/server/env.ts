import * as dotenv from "dotenv";
import { z } from "zod";

// Ensure environment variables from .env.local and .env are loaded for standalone scripts (seed, CLI)
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const OLD_DEFAULT_SESSION_SECRET =
  "dinepulse_super_secret_staff_session_key_2026";

function containsPlaceholder(val: string | undefined): boolean {
  if (!val) return false;
  return val.toLowerCase().includes("placeholder");
}

export function validateFrameAncestors(
  val: string | undefined,
  isProduction: boolean
): { valid: boolean; error?: string; origins: string[] } {
  if (!val || val.trim() === "") {
    return { valid: true, origins: [] };
  }

  const entries = val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    return { valid: true, origins: [] };
  }

  const origins: string[] = [];

  for (const entry of entries) {
    if (entry.includes("*")) {
      return {
        valid: false,
        error: `Wildcards are not allowed in FRAME_ANCESTORS: "${entry}". Specify exact origins.`,
        origins: [],
      };
    }

    if (!entry.startsWith("https://") && !entry.startsWith("http://")) {
      return {
        valid: false,
        error: `FRAME_ANCESTORS entries must start with https:// (or http:// for localhost outside production): "${entry}"`,
        origins: [],
      };
    }

    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      return {
        valid: false,
        error: `Invalid URL origin in FRAME_ANCESTORS: "${entry}"`,
        origins: [],
      };
    }

    if (url.search || url.hash || url.username || url.password) {
      return {
        valid: false,
        error: `Query parameters, hashes, or credentials are not allowed in FRAME_ANCESTORS: "${entry}"`,
        origins: [],
      };
    }

    const afterScheme = entry.replace(/^https?:\/\//, "");
    if (afterScheme.includes("/")) {
      return {
        valid: false,
        error: `Paths are not allowed in FRAME_ANCESTORS: "${entry}". Use exact origin format (e.g. https://example.com).`,
        origins: [],
      };
    }

    if (url.protocol === "http:") {
      if (isProduction) {
        return {
          valid: false,
          error: `http:// origins are not allowed in production in FRAME_ANCESTORS: "${entry}". Use https://.`,
          origins: [],
        };
      }
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return {
          valid: false,
          error: `Non-production http:// origins in FRAME_ANCESTORS must be localhost or 127.0.0.1: "${entry}"`,
          origins: [],
        };
      }
    } else if (url.protocol !== "https:") {
      return {
        valid: false,
        error: `Invalid protocol in FRAME_ANCESTORS: "${entry}". Must be https:// or http://.`,
        origins: [],
      };
    }

    origins.push(url.origin);
  }

  return { valid: true, origins };
}

export function validateSiteUrlOrigin(val: string | undefined): {
  valid: boolean;
  error?: string;
  origin?: string;
} {
  if (!val || val.trim() === "") return { valid: true };
  try {
    const url = new URL(val.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        valid: false,
        error: `Site URL must start with http:// or https://: "${val}"`,
      };
    }
    if (url.search || url.hash || url.username || url.password) {
      return {
        valid: false,
        error: `Site URL must not contain query parameters, hashes, or credentials: "${val}"`,
      };
    }
    if (url.pathname !== "" && url.pathname !== "/") {
      return {
        valid: false,
        error: `Site URL must be an absolute origin without a path: "${val}"`,
      };
    }
    return { valid: true, origin: url.origin };
  } catch {
    return {
      valid: false,
      error: `Invalid URL origin format for site URL: "${val}"`,
    };
  }
}

const rawEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SITE: z.enum(["customer", "kitchen", "manager", "all"]).default("all"),
  FRAME_ANCESTORS: z.string().optional(),
  NEXT_PUBLIC_SITE_NAME: z.string().optional(),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_APP_URL is required"),
  NEXT_PUBLIC_CUSTOMER_SITE_URL: z
    .preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
  NEXT_PUBLIC_KITCHEN_SITE_URL: z
    .preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
  NEXT_PUBLIC_MANAGER_SITE_URL: z
    .preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
  DEMO_MODE: z
    .preprocess((val) => {
      if (val === undefined || val === "" || val === null) return "false";
      return String(val);
    }, z.enum(["true", "false"]))
    .default("false"),
  DEMO_RESET_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  SEED_KITCHEN_PASSWORD: z.string().optional(),
  SEED_MANAGER_PASSWORD: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ALLOW_LOCAL_DEMO_UPLOADS: z
    .preprocess((val) => {
      if (val === undefined || val === "" || val === null) return "false";
      return String(val);
    }, z.enum(["true", "false"]))
    .default("false"),
});

const envSchema = rawEnvSchema.superRefine((data, ctx) => {
  const isProduction = data.NODE_ENV === "production";
  const isDemo = data.DEMO_MODE === "true";

  if (isProduction && data.ALLOW_LOCAL_DEMO_UPLOADS === "true") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ALLOW_LOCAL_DEMO_UPLOADS"],
      message:
        "ALLOW_LOCAL_DEMO_UPLOADS must not be 'true' in production. Production must always reject uploads from demo accounts.",
    });
  }

  if (data.FRAME_ANCESTORS) {
    const result = validateFrameAncestors(data.FRAME_ANCESTORS, isProduction);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FRAME_ANCESTORS"],
        message: result.error ?? "Invalid FRAME_ANCESTORS configuration.",
      });
    }
  }

  // Validate site URLs as absolute origins without path
  const siteUrlFields: Array<{
    field: "NEXT_PUBLIC_CUSTOMER_SITE_URL" | "NEXT_PUBLIC_KITCHEN_SITE_URL" | "NEXT_PUBLIC_MANAGER_SITE_URL";
    val: string | undefined;
  }> = [
    { field: "NEXT_PUBLIC_CUSTOMER_SITE_URL", val: data.NEXT_PUBLIC_CUSTOMER_SITE_URL },
    { field: "NEXT_PUBLIC_KITCHEN_SITE_URL", val: data.NEXT_PUBLIC_KITCHEN_SITE_URL },
    { field: "NEXT_PUBLIC_MANAGER_SITE_URL", val: data.NEXT_PUBLIC_MANAGER_SITE_URL },
  ];

  for (const { field, val } of siteUrlFields) {
    if (val) {
      const res = validateSiteUrlOrigin(val);
      if (!res.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: res.error ?? `Invalid origin for ${field}.`,
        });
      }
    }
  }

  if (isProduction) {
    // 1. SESSION_SECRET checks
    if (!data.SESSION_SECRET || data.SESSION_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "In production, SESSION_SECRET must be at least 32 characters long.",
      });
    }

    if (data.SESSION_SECRET === OLD_DEFAULT_SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "In production, SESSION_SECRET must NOT equal the old default secret ('dinepulse_super_secret_staff_session_key_2026').",
      });
    }

    if (containsPlaceholder(data.SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          'In production, SESSION_SECRET must not contain "placeholder".',
      });
    }

    // 2. Razorpay credentials checks (required & no placeholder unless DEMO_MODE === "true")
    if (!isDemo) {
      if (!data.RAZORPAY_KEY_ID || data.RAZORPAY_KEY_ID.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RAZORPAY_KEY_ID"],
          message:
            "In production without DEMO_MODE='true', RAZORPAY_KEY_ID is required.",
        });
      } else if (containsPlaceholder(data.RAZORPAY_KEY_ID)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RAZORPAY_KEY_ID"],
          message:
            'In production without DEMO_MODE=\'true\', RAZORPAY_KEY_ID must not contain "placeholder".',
        });
      }

      if (!data.RAZORPAY_KEY_SECRET || data.RAZORPAY_KEY_SECRET.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RAZORPAY_KEY_SECRET"],
          message:
            "In production without DEMO_MODE='true', RAZORPAY_KEY_SECRET is required.",
        });
      } else if (containsPlaceholder(data.RAZORPAY_KEY_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RAZORPAY_KEY_SECRET"],
          message:
            'In production without DEMO_MODE=\'true\', RAZORPAY_KEY_SECRET must not contain "placeholder".',
        });
      }

      if (
        !data.RAZORPAY_WEBHOOK_SECRET ||
        data.RAZORPAY_WEBHOOK_SECRET.trim() === ""
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RAZORPAY_WEBHOOK_SECRET"],
          message:
            "In production without DEMO_MODE='true', RAZORPAY_WEBHOOK_SECRET is required.",
        });
      } else if (containsPlaceholder(data.RAZORPAY_WEBHOOK_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RAZORPAY_WEBHOOK_SECRET"],
          message:
            'In production without DEMO_MODE=\'true\', RAZORPAY_WEBHOOK_SECRET must not contain "placeholder".',
        });
      }
    }

    // 3. Supabase variables checks (must not contain "placeholder")
    if (containsPlaceholder(data.NEXT_PUBLIC_SUPABASE_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SUPABASE_URL"],
        message:
          'In production, NEXT_PUBLIC_SUPABASE_URL must not contain "placeholder".',
      });
    }

    if (containsPlaceholder(data.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        message:
          'In production, NEXT_PUBLIC_SUPABASE_ANON_KEY must not contain "placeholder".',
      });
    }

    if (containsPlaceholder(data.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SUPABASE_SERVICE_ROLE_KEY"],
        message:
          'In production, SUPABASE_SERVICE_ROLE_KEY must not contain "placeholder".',
      });
    }
  }
});

function parseEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    const errorDetails = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("\n");
    console.error(errorDetails);
    throw new Error(
      `❌ Environment validation failed:\n${errorDetails}`
    );
  }

  return parsed.data;
}

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
