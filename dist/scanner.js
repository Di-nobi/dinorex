import { glob } from "glob";
import { readFileSync } from "fs";
import path from "path";
const ROUTE_PATTERNS = [
    "**/routes/**/*.{js,ts,tsx}",
    "**/route/**/*.{js,ts,tsx}",
    "**/router/**/*.{js,ts,tsx}",
    "**/*route*.{js,ts,tsx}",
    "**/*router*.{js,ts,tsx}",
    "**/*Route*.{js,ts,tsx}",
    "**/*Router*.{js,ts,tsx}",
];
const CONTROLLER_PATTERNS = [
    "**/controllers/**/*.{js,ts,tsx}",
    "**/controller/**/*.{js,ts,tsx}",
    "**/*controller*.{js,ts,tsx}",
    "**/*Controller*.{js,ts,tsx}",
];
const SERVICE_PATTERNS = [
    "**/services/**/*.{js,ts,tsx}",
    "**/service/**/*.{js,ts,tsx}",
    "**/*service*.{js,ts,tsx}",
    "**/*Service*.{js,ts,tsx}",
];
const MODEL_PATTERNS = [
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
const IGNORE_DIRS = [
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
async function findFiles(patterns, cwd) {
    const results = new Set();
    for (const pattern of patterns) {
        const files = await glob(pattern, { cwd, ignore: IGNORE_DIRS, absolute: true });
        files.forEach((f) => results.add(f));
    }
    return [...results];
}
function readFile(filePath) {
    try {
        return readFileSync(filePath, "utf-8");
    }
    catch {
        return null;
    }
}
function truncate(content, maxChars = 8000) {
    if (content.length <= maxChars)
        return content;
    return content.slice(0, maxChars) + "\n\n... [truncated for length]";
}
export async function scanProject(targetDir) {
    const cwd = path.resolve(targetDir);
    console.log(`\n🦕 Dinorex scanning: ${cwd}\n`);
    const [routeFiles, controllerFiles, serviceFiles, modelFiles] = await Promise.all([
        findFiles(ROUTE_PATTERNS, cwd),
        findFiles(CONTROLLER_PATTERNS, cwd),
        findFiles(SERVICE_PATTERNS, cwd),
        findFiles(MODEL_PATTERNS, cwd),
    ]);
    const summary = {
        routes: routeFiles.length,
        controllers: controllerFiles.length,
        services: serviceFiles.length,
        models: modelFiles.length,
    };
    const collected = {
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
//# sourceMappingURL=scanner.js.map