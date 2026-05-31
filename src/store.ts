/**
 * Persistent spec store — saves to .dinorex/spec.json in the user's project.
 * Tracks which files have been seen so we can detect new/changed routes.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import crypto from "crypto";

export interface FileEntry {
  path: string;
  content: string;
}

export interface FileHash {
  hash: string;
}

export interface SpecStore {
  spec: ApiSpec;
  hashes: Record<string, FileHash>;
  lastScan: string;
}

export interface ApiSpec {
  projectName: string;
  baseUrl: string;
  version: string;
  description: string;
  collections: Collection[];
}

export interface Collection {
  name: string;
  description: string;
  endpoints: Endpoint[];
}

export interface Endpoint {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description: string;
  requiresAuth: boolean;
  pathParams: Param[];
  queryParams: Param[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseDef>;
}

export interface Param {
  name: string;
  type: string;
  description: string;
  example: string | number;
}

export interface RequestBody {
  contentType: string;
  schema: Record<string, FieldDef>;
}

export interface FieldDef {
  type: string;
  example: unknown;
  required: boolean;
  description: string;
}

export interface ResponseDef {
  description: string;
  example?: unknown;
}

export interface DiffResult {
  newFiles: FileEntry[];
  changedFiles: FileEntry[];
  removedFiles: string[];
  unchanged: FileEntry[];
  newHashes: Record<string, FileHash>;
}

function storePath(projectDir: string): string {
  return path.join(projectDir, ".dinorex");
}

function specFile(projectDir: string): string {
  return path.join(storePath(projectDir), "spec.json");
}

function hashContent(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

export function loadStore(projectDir: string): SpecStore | null {
  const file = specFile(projectDir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as SpecStore;
  } catch {
    return null;
  }
}

export function saveStore(projectDir: string, data: SpecStore): void {
  const dir = storePath(projectDir);
  mkdirSync(dir, { recursive: true });

  const gi = path.join(dir, ".gitignore");
  if (!existsSync(gi)) writeFileSync(gi, "*\n");

  writeFileSync(specFile(projectDir), JSON.stringify(data, null, 2));
}

/**
 * Compare new scan against stored file hashes.
 * Returns:
 *  - newFiles    : files that didn't exist before
 *  - changedFiles: files whose content changed
 *  - removedFiles: files that no longer exist
 *  - unchanged   : everything else
 */
export function diffScan(
  storedHashes: Record<string, FileHash> = {},
  currentFiles: FileEntry[]
): DiffResult {
  const currentHashes: Record<string, { hash: string; content: string }> = {};
  for (const f of currentFiles) {
    currentHashes[f.path] = { hash: hashContent(f.content), content: f.content };
  }

  const newFiles: FileEntry[] = [];
  const changedFiles: FileEntry[] = [];
  const unchanged: FileEntry[] = [];

  for (const f of currentFiles) {
    const prev = storedHashes[f.path];
    if (!prev) {
      newFiles.push(f);
    } else if (prev.hash !== currentHashes[f.path].hash) {
      changedFiles.push(f);
    } else {
      unchanged.push(f);
    }
  }

  const currentPaths = new Set(currentFiles.map((f) => f.path));
  const removedFiles = Object.keys(storedHashes).filter((p) => !currentPaths.has(p));

  const newHashes: Record<string, FileHash> = {};
  for (const f of currentFiles) {
    newHashes[f.path] = { hash: currentHashes[f.path].hash };
  }

  return { newFiles, changedFiles, removedFiles, unchanged, newHashes };
}