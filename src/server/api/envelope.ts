import { NextResponse } from "next/server";
import type { ErrorCode, ServiceResult } from "@/server/services/result";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function apiOk<T>(
  data: T,
  status = 200,
  extraHeaders?: Record<string, string>
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    { success: true, data },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...extraHeaders,
      },
    }
  );
}

export function apiError(
  code: ErrorCode,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { success: false, error: { code, message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...extraHeaders,
      },
    }
  );
}

export function fromServiceResult<T>(
  result: ServiceResult<T>,
  successStatus = 200,
  extraHeaders?: Record<string, string>
): NextResponse<ApiResponse<T>> {
  if (result.ok) {
    return apiOk(result.data, successStatus, extraHeaders);
  }
  return apiError(result.code, result.message, result.status, extraHeaders);
}
