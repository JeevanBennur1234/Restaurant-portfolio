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

const rawEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_APP_URL is required"),
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
});

const envSchema = rawEnvSchema.superRefine((data, ctx) => {
  const isProduction = data.NODE_ENV === "production";
  const isDemo = data.DEMO_MODE === "true";

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
