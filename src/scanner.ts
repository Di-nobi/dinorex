import { glob } from "glob";
import { readFileSync } from "fs";
import path from "path";
import type { FileEntry } from "./store.js";

const ROUTE_PATTERNS: string[] = [
  "**/routes/**/*.{js,ts,tsx}",
  "**/route/**/*.{js,ts,tsx}",
  "**/router/**/*.{js,ts,tsx}",
  "**/*route*.{js,ts,tsx}",
  "**/*router*.{js,ts,tsx}",
  "**/*Route*.{js,ts,tsx}",
  "**/*Router*.{js,ts,tsx}",
];

const CONTROLLER_PATTERNS: string[] = [
  "**/controllers/**/*.{js,ts,tsx}",
  "**/controller/**/*.{js,ts,tsx}",
  "**/*controller*.{js,ts,tsx}",
  "**/*Controller*.{js,ts,tsx}",
];

const SERVICE_PATTERNS: string[] = [
  "**/services/**/*.{js,ts,tsx}",
  "**/service/**/*.{js,ts,tsx}",
  "**/*service*.{js,ts,tsx}",
  "**/*Service*.{js,ts,tsx}",
];

const MODEL_PATTERNS: string[] = [
  "**/models/**/*.{js,ts,tsx}",
  "**/model/**/*.{js,ts,tsx}",
  "**/schemas/**/*.{js,ts,tsx}",
  "**/schema/**/*.{js,ts,tsx}",
  "**/entities/**/*.{js,ts,tsx}",
  "**/dto/**/*.{js,ts,tsx}",
  "**/dtos/**/*.{js,ts,tsx}",
  "**/*model*.{js,ts,tsx}",
  "**/*Model*.{js,ts,tsx}",
  "**/*schema*.{js,ts,tsx}",
  "**/*Schema*.{js,ts,tsx}",
  "**/*entity*.{js,ts,tsx}",
  "**/*Entity*.{js,ts,tsx}",
  "**/*.dto.{ts,tsx}",
];

const IGNORE_DIRS: string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
];

export interface ScanSummary {
  routes: number;
  controllers: number;
  services: number;
  models: number;
}

export interface CollectedFiles {
  routes: FileEntry[];
  controllers: FileEntry[];
  services: FileEntry[];
  models: FileEntry[];
}

export interface ScanResult {
  cwd: string;
  summary: ScanSummary;
  collected: CollectedFiles;
}

async function findFiles(patterns: string[], cwd: string): Promise<string[]> {
  const results = new Set<string>();
  for (const pattern of patterns) {
    const files = await glob(pattern, { cwd, ignore: IGNORE_DIRS, absolute: true });
    files.forEach((f) => results.add(f));
  }
  return [...results];
}

function readFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function truncate(content: string, maxChars = 8000): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "\n\n... [truncated for length]";
}

export async function scanProject(targetDir: string): Promise<ScanResult> {
  const cwd = path.resolve(targetDir);

  console.log(`\n🦕 Dinorex scanning: ${cwd}\n`);

  const [routeFiles, controllerFiles, serviceFiles, modelFiles] = await Promise.all([
    findFiles(ROUTE_PATTERNS, cwd),
    findFiles(CONTROLLER_PATTERNS, cwd),
    findFiles(SERVICE_PATTERNS, cwd),
    findFiles(MODEL_PATTERNS, cwd),
  ]);

  const summary: ScanSummary = {
    routes: routeFiles.length,
    controllers: controllerFiles.length,
    services: serviceFiles.length,
    models: modelFiles.length,
  };

  const collected: CollectedFiles = {
    routes: routeFiles.map((f) => ({
      path: path.relative(cwd, f),
      content: truncate(readFile(f) ?? ""),
    })),
    controllers: controllerFiles.map((f) => ({
      path: path.relative(cwd, f),
      content: truncate(readFile(f) ?? ""),
    })),
    services: serviceFiles.map((f) => ({
      path: path.relative(cwd, f),
      content: truncate(readFile(f) ?? ""),
    })),
    models: modelFiles.map((f) => ({
      path: path.relative(cwd, f),
      content: truncate(readFile(f) ?? ""),
    })),
  };

  return { cwd, summary, collected };
}