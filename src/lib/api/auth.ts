import { apiFetch, type ApiResult } from "./client";
import type { StaffSession } from "./types";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: StaffSession;
}

/**
 * Authenticates staff members (kitchen, manager, admin) and establishes session cookie.
 */
export async function login(
  usernameOrCreds: string | LoginCredentials,
  passwordOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<AuthResponse>> {
  let body: LoginCredentials;
  let signal: AbortSignal | undefined;

  if (typeof usernameOrCreds === "string") {
    body = {
      username: usernameOrCreds,
      password: (passwordOrOpts as string) || "",
    };
    signal = opts?.signal;
  } else {
    body = usernameOrCreds;
    signal = (passwordOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body,
    signal,
  });
}

/**
 * Clears current staff session cookie.
 */
export async function logout(opts?: {
  signal?: AbortSignal;
}): Promise<ApiResult<{ success: true }>> {
  return apiFetch<{ success: true }>("/api/v1/auth/logout", {
    method: "POST",
    signal: opts?.signal,
  });
}

/**
 * Fetches current authenticated staff session.
 */
export async function me(opts?: {
  signal?: AbortSignal;
}): Promise<ApiResult<AuthResponse>> {
  return apiFetch<AuthResponse>("/api/v1/auth/me", {
    method: "GET",
    signal: opts?.signal,
  });
}

export const authApi = {
  login,
  logout,
  me,
};
