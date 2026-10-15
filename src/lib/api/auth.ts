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

/**
 * Initiates demo login via REST API for visitors without typing credentials.
 */
export async function demoLogin(
  role: "kitchen" | "manager",
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<{ success: boolean; redirectTo: string }>> {
  return apiFetch<{ success: boolean; redirectTo: string }>(
    "/api/v1/auth/demo-login",
    {
      method: "POST",
      body: { role },
      signal: opts?.signal,
    }
  );
}

/**
 * Client-side helper matching the demoLoginAction signature for UI components.
 */
export async function demoLoginAction(
  role: "kitchen" | "manager"
): Promise<{ success: boolean; redirectTo?: string; error?: string }> {
  const res = await demoLogin(role);
  if (res.ok) {
    return { success: true, redirectTo: res.data.redirectTo };
  }
  return { success: false, error: res.message || "Demo login failed" };
}

export const authApi = {
  login,
  logout,
  me,
  demoLogin,
  demoLoginAction,
};
