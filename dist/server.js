import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { loadAuth, apiRequest } from "./auth.js";
import { scanProject } from "./scanner.js";
import { loadStore, saveStore, diffScan } from "./store.js";
import { createHash } from "crypto";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export async function startServer(targetDir, options = {}) {
    const { port = 4321, _cachedSpec = null } = options;
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "50mb" }));
    app.use(express.static(path.join(__dirname, "public")));
    let specCache = _cachedSpec;
    let isAnalyzing = false;
    let analysisStatus = _cachedSpec
        ? { state: "ready" }
        : { state: "pending", message: "Starting analysis..." };
    async function runAnalysis(forceRescan = false) {
        if (isAnalyzing)
            return;
        isAnalyzing = true;
        try {
            const auth = loadAuth();
            if (!auth) {
                analysisStatus = { state: "error", message: "Not authenticated. Run: dinorex login" };
                return;
            }
            const { collected } = await scanProject(targetDir);
            const allFiles = [
                ...collected.routes,
                ...collected.controllers,
                ...collected.services,
                ...collected.models,
            ];
            const stored = loadStore(targetDir);
            if (!forceRescan && stored?.spec && stored?.hashes) {
                analysisStatus = { state: "analyzing", message: "Checking for new/changed endpoints..." };
                const diff = diffScan(stored.hashes, allFiles);
                if (!diff.newFiles.length && !diff.changedFiles.length && !diff.removedFiles.length) {
                    specCache = stored.spec;
                    analysisStatus = { state: "ready", message: "No changes detected." };
                    return;
                }
                // Send only changed files to server
                const res = await apiRequest("/scan", {
                    method: "POST",
                    token: auth.token,
                    body: {
                        projectName: path.basename(targetDir),
                        routes: [...diff.newFiles, ...diff.changedFiles].filter(f => collected.routes.find(r => r.path === f.path)),
                        controllers: [...diff.newFiles, ...diff.changedFiles].filter(f => collected.controllers.find(r => r.path === f.path)),
                        services: [...diff.newFiles, ...diff.changedFiles].filter(f => collected.services.find(r => r.path === f.path)),
                        models: [...diff.newFiles, ...diff.changedFiles].filter(f => collected.models.find(r => r.path === f.path)),
                        existingSpec: stored.spec,
                        removedFiles: diff.removedFiles,
                    },
                });
                specCache = res.spec;
                const storeData = {
                    spec: res.spec,
                    hashes: diff.newHashes,
                    lastScan: new Date().toISOString(),
                };
                saveStore(targetDir, storeData);
                analysisStatus = { state: "ready", message: "Spec updated with new endpoints." };
            }
            else {
                analysisStatus = { state: "analyzing", message: "Sending files to Dinorex server..." };
                const res = await apiRequest("/scan", {
                    method: "POST",
                    token: auth.token,
                    body: {
                        projectName: path.basename(targetDir),
                        routes: collected.routes,
                        controllers: collected.controllers,
                        services: collected.services,
                        models: collected.models,
                    },
                });
                specCache = res.spec;
                const hashes = {};
                for (const f of allFiles) {
                    hashes[f.path] = { hash: createHash("md5").update(f.content).digest("hex") };
                }
                saveStore(targetDir, { spec: res.spec, hashes, lastScan: new Date().toISOString() });
                analysisStatus = { state: "ready", message: "Full analysis complete." };
            }
        }
        catch (err) {
            analysisStatus = {
                state: "error",
                message: err instanceof Error ? err.message : String(err),
            };
        }
        finally {
            isAnalyzing = false;
        }
    }
    // Bootstrap
    if (!specCache) {
        const stored = loadStore(targetDir);
        if (stored?.spec) {
            specCache = stored.spec;
            analysisStatus = { state: "ready", message: "Loaded from cache." };
            runAnalysis(false);
        }
        else {
            runAnalysis(true);
        }
    }
    else {
        analysisStatus = { state: "ready" };
    }
    // ── Routes ──────────────────────────────────────────────────────────────
    app.get("/api/status", (_req, res) => res.json(analysisStatus));
    app.get("/api/spec", (_req, res) => {
        if (!specCache)
            return void res.json({ _loading: true, status: analysisStatus });
        res.json(specCache);
    });
    app.post("/api/rescan", (_req, res) => {
        if (isAnalyzing)
            return void res.json({ message: "Already scanning..." });
        runAnalysis(false);
        res.json({ message: "Rescan started" });
    });
    app.post("/api/rescan/full", (_req, res) => {
        if (isAnalyzing)
            return void res.json({ message: "Already scanning..." });
        runAnalysis(true);
        res.json({ message: "Full rescan started" });
    });
    app.get("*", (_req, res) => {
        res.sendFile(path.join(__dirname, "public", "index.html"));
    });
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            resolve({ server, port, url: `http://localhost:${port}` });
        });
    });
}
//# sourceMappingURL=server.js.map