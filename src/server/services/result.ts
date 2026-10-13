import type { Database } from "@/server/db";

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT"
  | "INTERNAL";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; status: number };

export interface ServiceActor {
  userId: string;
  restaurantId: string;
  role: string;
  username?: string;
  isDemo?: boolean;
}

export interface Ctx {
  db: Database;
  now?: Date;
  actor?: ServiceActor;
}

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ErrorCode,
  message: string,
  status: number
): ServiceResult<T> {
  return { ok: false, code, message, status };
}
