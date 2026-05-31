#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

function banner() {
  console.log();
  console.log(chalk.green.bold("  🦕  DINOREX") + chalk.dim(" v" + pkg.version));
  console.log(chalk.dim("  AI-powered API documentation — one command, full docs."));
  console.log();
}

function checkApiKey(options) {
  const isAnthropic = options.provider === "anthropic" || process.env.DINOREX_PROVIDER === "anthropic";

  if (isAnthropic) {
    if (options.apiKey) process.env.ANTHROPIC_API_KEY = options.apiKey;
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(chalk.red("  ✗ ANTHROPIC_API_KEY is not set.\n"));
      console.log(chalk.dim("  Option 1 — env var:   export ANTHROPIC_API_KEY=sk-ant-..."));
      console.log(chalk.dim("  Option 2 — flag:      dinorex scan --provider anthropic --api-key sk-ant-..."));
      console.log();
      process.exit(1);
    }
  } else {
    if (options.apiKey) process.env.GROQ_API_KEY = options.apiKey;
    if (!process.env.GROQ_API_KEY) {
      console.log(chalk.red("  ✗ GROQ_API_KEY is not set.\n"));
      console.log(chalk.dim("  Get a free key at: https://console.groq.com"));
      console.log(chalk.dim("  Then: export GROQ_API_KEY=gsk_your_key_here"));
      console.log(chalk.dim("  Or:   dinorex scan --api-key gsk_..."));
      console.log(chalk.dim("  To use Anthropic instead: dinorex scan --provider anthropic --api-key sk-ant-..."));
      console.log();
      process.exit(1);
    }
  }
}

// ── dinorex scan [dir] ────────────────────────────────────────────────────
program
  .name("dinorex")
  .version(pkg.version)
  .description("AI-powered API documentation generator");

program
  .command("scan [directory]")
  .alias("init")
  .description("Scan a project and launch the interactive docs UI")
  .option("-p, --port <port>", "Port for the docs server", "4321")
  .option("--no-open", "Skip auto-opening browser")
  .option("--api-key <key>", "Anthropic API key")
  .option("--provider <name>", "AI provider: anthropic (default) or groq")
  .action(async (directory = ".", options) => {
    banner();
    checkApiKey(options);

    const targetDir = path.resolve(directory);
    const port = parseInt(options.port, 10);

    const { scanProject }     = await import("./scanner.js");
    const agentFile = options.provider === "anthropic" || process.env.DINOREX_PROVIDER === "anthropic"
      ? "./agent.js"
      : "./agent.groq.js";
    const { analyzeWithAI, analyzeIncremental } = await import(agentFile);
    const { startServer }     = await import("./server.js");
    const { loadStore, saveStore, diffScan } = await import("./store.js");
    const { createHash }      = await import("crypto");

    console.log(chalk.dim(`  📂 ${targetDir}`));
    const providerLabel = (options.provider === "anthropic" || process.env.DINOREX_PROVIDER === "anthropic") ? "anthropic" : "groq (free)";
    console.log(chalk.dim(`  🤖 Provider: ${providerLabel}\n`));

    // ── 1. Scan ──
    const s1 = ora({ text: "Scanning project files…", color: "green" }).start();
    let scanResult;
    try { scanResult = await scanProject(targetDir); }
    catch (e) { s1.fail(chalk.red(e.message)); process.exit(1); }

    const { summary, collected } = scanResult;
    const total = Object.values(summary).reduce((a,b)=>a+b,0);
    if (!total) {
      s1.fail(chalk.red("No API files found. Make sure you're in an Express/Nest/Fastify project."));
      process.exit(1);
    }
    s1.succeed(chalk.green("Discovered: ") + chalk.white(
      `${summary.routes} routes  ${summary.controllers} controllers  ${summary.services} services  ${summary.models} models`
    ));

    // ── 2. AI analysis (full or incremental) ──
    const stored = loadStore(targetDir);
    const allFiles = [...collected.routes, ...collected.controllers, ...collected.services, ...collected.models];
    let spec;

    if (stored?.spec && stored?.hashes) {
      const diff = diffScan(stored.hashes, allFiles);
      const hasChanges = diff.newFiles.length || diff.changedFiles.length || diff.removedFiles.length;

      if (hasChanges) {
        const s2 = ora({ text: `Incremental update — ${diff.newFiles.length} new, ${diff.changedFiles.length} changed files…`, color: "cyan" }).start();
        try {
          const result = await analyzeIncremental(stored.spec, diff);
          spec = result.spec;
          const hashes = {};
          for (const f of allFiles) hashes[f.path] = { hash: createHash("md5").update(f.content).digest("hex") };
          saveStore(targetDir, { spec, hashes, lastScan: new Date().toISOString() });
          s2.succeed(chalk.cyan("Incremental update complete."));
        } catch(e) { s2.fail(chalk.red(e.message)); process.exit(1); }
      } else {
        spec = stored.spec;
        console.log(chalk.dim("  ✓ No changes since last scan — using cached spec."));
      }
    } else {
      const s2 = ora({ text: "Running full AI analysis (~15s)…", color: "cyan" }).start();
      try {
        spec = await analyzeWithAI(collected, path.basename(targetDir));
        const hashes = {};
        for (const f of allFiles) hashes[f.path] = { hash: createHash("md5").update(f.content).digest("hex") };
        saveStore(targetDir, { spec, hashes, lastScan: new Date().toISOString() });
        s2.succeed(chalk.cyan("Analysis complete — ") + chalk.white(
          `${spec.collections.reduce((a,c)=>a+c.endpoints.length,0)} endpoints across ${spec.collections.length} collections`
        ));
      } catch(e) { s2.fail(chalk.red(e.message)); process.exit(1); }
    }

    // ── 3. Start server ──
    const s3 = ora({ text: `Starting docs server on :${port}…`, color: "yellow" }).start();
    let srv;
    try { srv = await startServer(targetDir, { port, _cachedSpec: spec }); }
    catch(e) { s3.fail(chalk.red(e.message)); process.exit(1); }
    s3.succeed(chalk.yellow("Docs server running!"));

    console.log();
    console.log(chalk.green.bold(`  ✓ Dinorex docs → ${srv.url}`));
    console.log(chalk.dim(`  Postman export → ${srv.url}/api/export/postman`));
    console.log(chalk.dim(`  Swagger export → ${srv.url}/api/export/swagger`));
    console.log();
    console.log(chalk.dim("  Tip: run  dinorex scan  again anytime to pick up new endpoints."));
    console.log(chalk.dim("  Ctrl+C to stop.\n"));

    if (options.open !== false) {
      try {
        const cmd = process.platform==="darwin" ? `open ${srv.url}` : process.platform==="win32" ? `start ${srv.url}` : `xdg-open ${srv.url}`;
        execSync(cmd, { stdio: "ignore" });
      } catch {}
    }

    process.on("SIGINT", () => { console.log(chalk.dim("\n  Dinorex stopped. 🦕\n")); process.exit(0); });
  });

// ── dinorex generate [dir] — just files, no server ────────────────────────
program
  .command("generate [directory]")
  .description("Generate Postman + Swagger files only (no server)")
  .option("--out <dir>", "Output directory", "./dinorex-output")
  .option("--api-key <key>", "Anthropic API key")
  .action(async (directory = ".", options) => {
    banner();
    checkApiKey(options);

    const targetDir = path.resolve(directory);
    const outputDir = path.resolve(options.out);

    const { scanProject }     = await import("./scanner.js");
    const { analyzeWithAI }   = await import("./agent.js");
    const { generatePostmanCollection } = await import("./generators/postman.js");
    const { generateSwaggerSpec }       = await import("./generators/swagger.js");
    const { mkdirSync, writeFileSync }  = await import("fs");
    const { createHash }      = await import("crypto");
    const { loadStore, saveStore, diffScan } = await import("./store.js");

    const s1 = ora("Scanning…").start();
    const { collected } = await scanProject(targetDir);
    s1.succeed("Scanned");

    const s2 = ora("AI analysis…").start();
    const spec = await analyzeWithAI(collected, path.basename(targetDir));
    s2.succeed("Done");

    mkdirSync(outputDir, { recursive: true });
    const slug = spec.projectName.replace(/\s+/g, "-");
    const { writeFileSync: wf } = await import("fs");
    wf(path.join(outputDir, `${slug}-postman.json`), JSON.stringify(generatePostmanCollection(spec), null, 2));
    wf(path.join(outputDir, `${slug}-openapi.yaml`), generateSwaggerSpec(spec));
    wf(path.join(outputDir, `${slug}-spec.json`), JSON.stringify(spec, null, 2));

    console.log(chalk.green.bold(`\n  ✓ Written to ${outputDir}/`));
    console.log(chalk.dim(`    ${slug}-postman.json\n    ${slug}-openapi.yaml\n    ${slug}-spec.json\n`));
  });

program.parse();