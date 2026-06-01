import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import path from "path";
import os from "os";

const AUTH_DIR = path.join(os.homedir(), ".dinorex");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

export interface AuthData {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    plan: string;
    scansThisMonth: number;
    scanLimit: number | null;
    scansRemaining: number | null;
  };
}

export function loadAuth(): AuthData | null {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    return JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as AuthData;
  } catch {
    return null;
  }
}

export function saveAuth(data: AuthData): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

export function clearAuth(): void {
  try {
    if (existsSync(AUTH_FILE)) rmSync(AUTH_FILE);
  } catch {}
}

export function getApiUrl(): string {
  return process.env.DINOREX_API_URL || "https://dinorex-server.onrender.com";
}

export async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
  } = {}
): Promise<T> {
  const { method = "GET", body, token } = options;
  const url = `${getApiUrl()}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as T & { error?: string; hint?: string };

  if (!res.ok) {
    const msg = (data as { error?: string }).error || `Request failed (${res.status})`;
    const hint = (data as { hint?: string }).hint;
    throw new Error(hint ? `${msg}\n  ${hint}` : msg);
  }

  return data;
}