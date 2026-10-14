import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { StaffRole } from "@/server/db/schema";
import type { StaffSession } from "@/server/auth";
import type { ServiceResult } from "@/server/services/result";
import { checkRateLimit } from "@/server/rate-limit";
import { apiError, fromServiceResult } from "./envelope";
import {
  requireStaff,
  requireTableToken,
  validateOrigin,
  getClientIpFromRequest,
  type TableWithRestaurant,
} from "./guards";

export interface WithApiOptions<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
> {
  paramsSchema?: z.ZodType<TParams>;
  querySchema?: z.ZodType<TQuery>;
  bodySchema?: z.ZodType<TBody>;
  roles?: StaffRole[];
  requireStaff?: boolean;
  requireTableToken?: boolean;
  checkOrigin?: boolean;
  rateLimit?: "customer" | "staff" | "none";
}

export interface ApiContext<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
> {
  req: NextRequest;
  params: TParams;
  query: TQuery;
  body: TBody;
  actor?: StaffSession;
  table?: TableWithRestaurant;
  tableToken?: string;
  requestId: string;
}

export type ApiHandler<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
> = (
  ctx: ApiContext<TParams, TQuery, TBody>
) => Promise<NextResponse | ServiceResult<unknown> | Response>;

export function withApi<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
>(
  handler: ApiHandler<TParams, TQuery, TBody>,
  options: WithApiOptions<TParams, TQuery, TBody> = {}
) {
  return async (
    req: NextRequest,
    routeContext?: {
      params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
    }
  ): Promise<Response> => {
    const requestId = crypto.randomUUID();

    try {
      // 1. Origin verification for cookie-authenticated write requests
      const isWriteMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(
        req.method.toUpperCase()
      );
      const isCookieAuth = Boolean(
        options.requireStaff ||
        (options.roles && options.roles.length > 0) ||
        options.checkOrigin
      );

      if (isWriteMethod && isCookieAuth) {
        if (!validateOrigin(req)) {
          return apiError("FORBIDDEN", "Forbidden: Invalid origin", 403, {
            "x-request-id": requestId,
          });
        }
      }

      // 2. Resolve and validate path parameters
      let rawParams: Record<string, string | string[]> = {};
      if (routeContext?.params) {
        rawParams = await Promise.resolve(routeContext.params);
      }
      let paramsData: unknown = rawParams;
      if (options.paramsSchema) {
        const parsed = options.paramsSchema.safeParse(rawParams);
        if (!parsed.success) {
          return apiError(
            "VALIDATION",
            parsed.error.issues[0]?.message ?? "Invalid path parameters",
            400,
            { "x-request-id": requestId }
          );
        }
        paramsData = parsed.data;
      }

      // 3. Resolve and validate query parameters
      const searchParamsObj = Object.fromEntries(
        req.nextUrl.searchParams.entries()
      );
      let queryData: unknown = searchParamsObj;
      if (options.querySchema) {
        const parsed = options.querySchema.safeParse(searchParamsObj);
        if (!parsed.success) {
          return apiError(
            "VALIDATION",
            parsed.error.issues[0]?.message ?? "Invalid query parameters",
            400,
            { "x-request-id": requestId }
          );
        }
        queryData = parsed.data;
      }

      // 4. Safely parse and validate JSON body
      let bodyData: unknown = undefined;
      const contentType = req.headers.get("content-type") || "";
      if (
        isWriteMethod &&
        contentType.toLowerCase().includes("application/json")
      ) {
        try {
          const text = await req.text();
          if (text.trim().length > 0) {
            bodyData = JSON.parse(text);
          } else {
            bodyData = {};
          }
        } catch {
          return apiError("VALIDATION", "Invalid JSON body", 400, {
            "x-request-id": requestId,
          });
        }
      }

      if (options.bodySchema) {
        const parsed = options.bodySchema.safeParse(bodyData ?? {});
        if (!parsed.success) {
          return apiError(
            "VALIDATION",
            parsed.error.issues[0]?.message ?? "Invalid request body",
            400,
            { "x-request-id": requestId }
          );
        }
        bodyData = parsed.data;
      }

      // 5. Staff auth guard
      let actor: StaffSession | undefined = undefined;
      if (options.requireStaff || (options.roles && options.roles.length > 0)) {
        const staffCheck = await requireStaff(options.roles);
        if (!staffCheck.ok) {
          return apiError(
            staffCheck.error.code,
            staffCheck.error.message,
            staffCheck.error.status,
            { "x-request-id": requestId }
          );
        }
        actor = staffCheck.actor;
      }

      // 6. Table token guard
      let table: TableWithRestaurant | undefined = undefined;
      let tableToken: string | undefined = undefined;
      if (options.requireTableToken) {
        const tokenFromParams =
          typeof (paramsData as Record<string, unknown> | null)?.token === "string"
            ? ((paramsData as Record<string, unknown>).token as string)
            : undefined;
        const tableCheck = await requireTableToken(req, tokenFromParams);
        if (!tableCheck.ok) {
          return apiError(
            tableCheck.error.code,
            tableCheck.error.message,
            tableCheck.error.status,
            { "x-request-id": requestId }
          );
        }
        table = tableCheck.table;
        tableToken = tableCheck.token;
      }

      // 7. Rate limiting
      if (options.rateLimit === "customer") {
        const ip = getClientIpFromRequest(req);

        const ipLimit = await checkRateLimit({
          key: `api:customer:ip:${ip}`,
          limit: 120,
          windowMs: 60 * 1000,
        });

        if (!ipLimit.allowed) {
          return apiError(
            "RATE_LIMITED",
            `Rate limit exceeded. Try again in ${ipLimit.retryAfterSeconds}s`,
            429,
            {
              "Retry-After": String(ipLimit.retryAfterSeconds ?? 60),
              "x-request-id": requestId,
            }
          );
        }

        const effectiveToken =
          tableToken ||
          (typeof (paramsData as Record<string, unknown> | null)?.token === "string"
            ? ((paramsData as Record<string, unknown>).token as string)
            : null) ||
          req.headers.get("x-table-token");

        if (effectiveToken) {
          const tableRate = await checkRateLimit({
            key: `api:customer:table:${effectiveToken}`,
            limit: 60,
            windowMs: 60 * 1000,
          });

          if (!tableRate.allowed) {
            return apiError(
              "RATE_LIMITED",
              `Rate limit exceeded for table. Try again in ${tableRate.retryAfterSeconds}s`,
              429,
              {
                "Retry-After": String(tableRate.retryAfterSeconds ?? 60),
                "x-request-id": requestId,
              }
            );
          }
        }
      } else if (options.rateLimit === "staff" && actor) {
        const staffRate = await checkRateLimit({
          key: `api:staff:${actor.userId}`,
          limit: 120,
          windowMs: 60 * 1000,
        });

        if (!staffRate.allowed) {
          return apiError(
            "RATE_LIMITED",
            `Staff rate limit exceeded. Try again in ${staffRate.retryAfterSeconds}s`,
            429,
            {
              "Retry-After": String(staffRate.retryAfterSeconds ?? 60),
              "x-request-id": requestId,
            }
          );
        }
      }

      // 8. Execute handler
      const result = await handler({
        req,
        params: paramsData as TParams,
        query: queryData as TQuery,
        body: bodyData as TBody,
        actor,
        table,
        tableToken,
        requestId,
      });

      // 9. Format response
      if (result instanceof Response) {
        result.headers.set("x-request-id", requestId);
        if (!result.headers.has("Cache-Control")) {
          result.headers.set("Cache-Control", "no-store");
        }
        return result;
      }

      // Result is a ServiceResult
      return fromServiceResult(result, 200, { "x-request-id": requestId });
    } catch (err) {
      if (typeof err === "object" && err !== null && "digest" in err) {
        throw err;
      }
      console.error(`[API ${requestId}] Unexpected error:`, err);
      return apiError("INTERNAL", "Internal server error", 500, {
        "x-request-id": requestId,
      });
    }
  };
}
