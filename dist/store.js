/**
 * Persistent spec store — saves to .dinorex/spec.json in the user's project.
 * Tracks which files have been seen so we can detect new/changed routes.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import crypto from "crypto";
function storePath(projectDir) {
    return path.join(projectDir, ".dinorex");
}
function specFile(projectDir) {
    return path.join(storePath(projectDir), "spec.json");
}
function hashContent(content) {
    return crypto.createHash("md5").update(content).digest("hex");
}
export function loadStore(projectDir) {
    const file = specFile(projectDir);
    if (!existsSync(file))
        return null;
    try {
        return JSON.parse(readFileSync(file, "utf-8"));
    }
    catch {
        return null;
    }
}
export function saveStore(projectDir, data) {
    const dir = storePath(projectDir);
    mkdirSync(dir, { recursive: true });
    const gi = path.join(dir, ".gitignore");
    if (!existsSync(gi))
        writeFileSync(gi, "*\n");
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
export function diffScan(storedHashes = {}, currentFiles) {
    const currentHashes = {};
    for (const f of currentFiles) {
        currentHashes[f.path] = { hash: hashContent(f.content), content: f.content };
    }
    const newFiles = [];
    const changedFiles = [];
    const unchanged = [];
    for (const f of currentFiles) {
        const prev = storedHashes[f.path];
        if (!prev) {
            newFiles.push(f);
        }
        else if (prev.hash !== currentHashes[f.path].hash) {
            changedFiles.push(f);
        }
        else {
            unchanged.push(f);
        }
    }
    const currentPaths = new Set(currentFiles.map((f) => f.path));
    const removedFiles = Object.keys(storedHashes).filter((p) => !currentPaths.has(p));
    const newHashes = {};
    for (const f of currentFiles) {
        newHashes[f.path] = { hash: currentHashes[f.path].hash };
    }
    return { newFiles, changedFiles, removedFiles, unchanged, newHashes };
}
//# sourceMappingURL=store.js.map