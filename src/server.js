import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { scanProject } from "./scanner.js";
import { analyzeWithAI, analyzeIncremental } from "./agent.js";
import { generatePostmanCollection } from "./generators/postman.js";
import { generateSwaggerSpec } from "./generators/swagger.js";
import { loadStore, saveStore, diffScan } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startServer(targetDir, options = {}) {
  const { port = 4321, _cachedSpec = null } = options;

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  let specCache = _cachedSpec;
  let isAnalyzing = false;
  let analysisStatus = _cachedSpec ? { state: "ready" } : { state: "pending", message: "Starting analysis..." };

  async function runAnalysis(forceRescan = false) {
    if (isAnalyzing) return;
    isAnalyzing = true;

    try {
      const { collected, summary } = await scanProject(targetDir);
      const allFiles = [
        ...collected.routes,
        ...collected.controllers,
        ...collected.services,
        ...collected.models,
      ];

      const stored = loadStore(targetDir);

      if (!forceRescan && stored && stored.spec && stored.hashes) {
        // Incremental mode
        analysisStatus = { state: "analyzing", message: "Checking for new/changed endpoints..." };
        const diff = diffScan(stored.hashes, allFiles);

        const { spec, changed } = await analyzeIncremental(stored.spec, diff);
        specCache = spec;

        if (changed) {
          saveStore(targetDir, { spec, hashes: diff.newHashes, lastScan: new Date().toISOString() });
          analysisStatus = { state: "ready", message: "Spec updated with new endpoints." };
        } else {
          analysisStatus = { state: "ready", message: "No changes detected." };
        }
      } else {
        // Full scan
        analysisStatus = { state: "analyzing", message: "Running full AI analysis..." };
        const projectName = path.basename(targetDir);
        specCache = await analyzeWithAI(collected, projectName);

        const hashes = {};
        for (const f of allFiles) {
          const { createHash } = await import("crypto");
          hashes[f.path] = { hash: createHash("md5").update(f.content).digest("hex") };
        }
        saveStore(targetDir, { spec: specCache, hashes, lastScan: new Date().toISOString() });
        analysisStatus = { state: "ready", message: "Full analysis complete." };
      }
    } catch (err) {
      analysisStatus = { state: "error", message: err.message };
    } finally {
      isAnalyzing = false;
    }
  }

  // On startup: use cache if no cached spec passed in
  if (!specCache) {
    const stored = loadStore(targetDir);
    if (stored?.spec) {
      specCache = stored.spec;
      analysisStatus = { state: "ready", message: "Loaded from cache." };
      // Still run incremental check in background
      runAnalysis(false);
    } else {
      runAnalysis(true);
    }
  } else {
    analysisStatus = { state: "ready" };
  }

  // ── Routes ──────────────────────────────────────────────────────────────

  app.get("/api/status", (req, res) => res.json(analysisStatus));

  app.get("/api/spec", (req, res) => {
    if (!specCache) return res.json({ _loading: true, status: analysisStatus });
    res.json(specCache);
  });

  app.post("/api/rescan", async (req, res) => {
    if (isAnalyzing) return res.json({ message: "Already scanning..." });
    runAnalysis(false); // incremental
    res.json({ message: "Rescan started" });
  });

  app.post("/api/rescan/full", async (req, res) => {
    if (isAnalyzing) return res.json({ message: "Already scanning..." });
    runAnalysis(true); // force full
    res.json({ message: "Full rescan started" });
  });

  app.get("/api/export/postman", (req, res) => {
    if (!specCache) return res.status(503).json({ error: "Still analyzing" });
    const collection = generatePostmanCollection(specCache);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${specCache.projectName.replace(/\s+/g, "-")}-postman.json"`);
    res.json(collection);
  });

  app.get("/api/export/swagger", (req, res) => {
    if (!specCache) return res.status(503).json({ error: "Still analyzing" });
    const yamlContent = generateSwaggerSpec(specCache);
    res.setHeader("Content-Type", "application/x-yaml");
    res.setHeader("Content-Disposition", `attachment; filename="${specCache.projectName.replace(/\s+/g, "-")}-openapi.yaml"`);
    res.send(yamlContent);
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve({ server, port, url: `http://localhost:${port}` });
    });
  });
}