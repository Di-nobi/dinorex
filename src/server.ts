import express, { type Request, type Response, type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "http";
import { scanProject } from "./scanner.js";
import { analyzeWithAI, analyzeIncremental } from "./agent.js";
import { loadStore, saveStore, diffScan, type ApiSpec, type SpecStore } from "./store.js";
import { createHash } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface AnalysisStatus {
  state: "pending" | "analyzing" | "ready" | "error";
  message?: string;
}

interface ServerOptions {
  port?: number;
  _cachedSpec?: ApiSpec | null;
}

interface ServerResult {
  server: Server;
  port: number;
  url: string;
}

export async function startServer(
  targetDir: string,
  options: ServerOptions = {}
): Promise<ServerResult> {
  const { port = 4321, _cachedSpec = null } = options;

  const app: Express = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  let specCache: ApiSpec | null = _cachedSpec;
  let isAnalyzing = false;
  let analysisStatus: AnalysisStatus = _cachedSpec
    ? { state: "ready" }
    : { state: "pending", message: "Starting analysis..." };

  async function runAnalysis(forceRescan = false): Promise<void> {
    if (isAnalyzing) return;
    isAnalyzing = true;

    try {
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
        const { spec, changed } = await analyzeIncremental(stored.spec, diff);
        specCache = spec;

        if (changed) {
          const storeData: SpecStore = {
            spec,
            hashes: diff.newHashes,
            lastScan: new Date().toISOString(),
          };
          saveStore(targetDir, storeData);
          analysisStatus = { state: "ready", message: "Spec updated with new endpoints." };
        } else {
          analysisStatus = { state: "ready", message: "No changes detected." };
        }
      } else {
        analysisStatus = { state: "analyzing", message: "Running full AI analysis..." };
        const projectName = path.basename(targetDir);
        specCache = await analyzeWithAI(collected, projectName);

        const hashes: SpecStore["hashes"] = {};
        for (const f of allFiles) {
          hashes[f.path] = { hash: createHash("md5").update(f.content).digest("hex") };
        }
        saveStore(targetDir, { spec: specCache, hashes, lastScan: new Date().toISOString() });
        analysisStatus = { state: "ready", message: "Full analysis complete." };
      }
    } catch (err) {
      analysisStatus = {
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      isAnalyzing = false;
    }
  }

  if (!specCache) {
    const stored = loadStore(targetDir);
    if (stored?.spec) {
      specCache = stored.spec;
      analysisStatus = { state: "ready", message: "Loaded from cache." };
      runAnalysis(false);
    } else {
      runAnalysis(true);
    }
  } else {
    analysisStatus = { state: "ready" };
  }

  // ── Routes ──────────────────────────────────────────────────────────────

  app.get("/api/status", (_req: Request, res: Response) => res.json(analysisStatus));

  app.get("/api/spec", (_req: Request, res: Response) => {
    if (!specCache) return void res.json({ _loading: true, status: analysisStatus });
    res.json(specCache);
  });

  app.post("/api/rescan", (_req: Request, res: Response) => {
    if (isAnalyzing) return void res.json({ message: "Already scanning..." });
    runAnalysis(false);
    res.json({ message: "Rescan started" });
  });

  app.post("/api/rescan/full", (_req: Request, res: Response) => {
    if (isAnalyzing) return void res.json({ message: "Already scanning..." });
    runAnalysis(true);
    res.json({ message: "Full rescan started" });
  });

  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve({ server, port, url: `http://localhost:${port}` });
    });
  });
}