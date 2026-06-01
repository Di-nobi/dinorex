#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as readline from "readline";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { execSync } from "child_process";
import { loadAuth, saveAuth, clearAuth, apiRequest } from "./auth.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
// ── Helpers ───────────────────────────────────────────────────────────────
function banner() {
    console.log();
    console.log(chalk.green.bold("  🦕  DINOREX") + chalk.dim(" v" + pkg.version));
    console.log(chalk.dim("  AI-powered API documentation — one command, full docs."));
    console.log();
}
function prompt(question, options = {}) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: options.hidden ? undefined : process.stdout,
        });
        if (options.hidden) {
            process.stdout.write(question);
            process.stdin.setRawMode?.(true);
            let value = "";
            process.stdin.resume();
            process.stdin.setEncoding("utf8");
            const onData = (char) => {
                if (char === "\n" || char === "\r" || char === "\u0003") {
                    process.stdin.setRawMode?.(false);
                    process.stdin.pause();
                    process.stdin.removeListener("data", onData);
                    process.stdout.write("\n");
                    resolve(value);
                }
                else if (char === "\u007F") {
                    value = value.slice(0, -1);
                }
                else {
                    value += char;
                    process.stdout.write("*");
                }
            };
            process.stdin.on("data", onData);
            rl.close();
        }
        else {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer.trim());
            });
        }
    });
}
function printUser(auth) {
    const plan = auth.user.plan === "PRO"
        ? chalk.yellow("PRO ⚡")
        : chalk.dim("Free");
    const scans = auth.user.plan === "PRO"
        ? chalk.green("unlimited")
        : chalk.white(`${auth.user.scansRemaining ?? 0}/${auth.user.scanLimit} remaining this month`);
    console.log(chalk.dim(`  Logged in as: `) + chalk.white(auth.user.email));
    console.log(chalk.dim(`  Plan: `) + plan + chalk.dim("  |  Scans: ") + scans);
    console.log();
}
// ── Auth flow — called automatically before scan if not logged in ─────────
async function ensureAuth() {
    const existing = loadAuth();
    if (existing)
        return existing;
    console.log(chalk.yellow("  You need an account to use Dinorex.\n"));
    const choice = await prompt("  Do you have an account? (yes/no): ");
    console.log();
    if (choice.toLowerCase().startsWith("y")) {
        return await runLogin();
    }
    else {
        return await runSignup();
    }
}
async function runSignup() {
    console.log(chalk.green.bold("  Create your free account\n"));
    const name = await prompt("  Name:     ");
    const email = await prompt("  Email:    ");
    const password = await prompt("  Password: ", { hidden: true });
    const spinner = ora({ text: "Creating account…", color: "green" }).start();
    try {
        const res = await apiRequest("/auth/signup", { method: "POST", body: { name, email, password } });
        const auth = { token: res.token, user: res.user };
        saveAuth(auth);
        spinner.succeed(chalk.green(res.message));
        return auth;
    }
    catch (err) {
        spinner.fail(chalk.red(err.message));
        process.exit(1);
    }
}
async function runLogin() {
    console.log(chalk.green.bold("  Login to Dinorex\n"));
    const email = await prompt("  Email:    ");
    const password = await prompt("  Password: ", { hidden: true });
    const spinner = ora({ text: "Logging in…", color: "green" }).start();
    try {
        const res = await apiRequest("/auth/login", { method: "POST", body: { email, password } });
        const auth = { token: res.token, user: res.user };
        saveAuth(auth);
        spinner.succeed(chalk.green(res.message));
        return auth;
    }
    catch (err) {
        spinner.fail(chalk.red(err.message));
        process.exit(1);
    }
}
// ── Commands ──────────────────────────────────────────────────────────────
program
    .name("dinorex")
    .version(pkg.version)
    .description("AI-powered API documentation generator");
// ── dinorex signup ────────────────────────────────────────────────────────
program
    .command("signup")
    .description("Create a free Dinorex account")
    .action(async () => {
    banner();
    const auth = await runSignup();
    printUser(auth);
});
// ── dinorex login ─────────────────────────────────────────────────────────
program
    .command("login")
    .description("Login to your Dinorex account")
    .action(async () => {
    banner();
    const auth = await runLogin();
    printUser(auth);
});
// ── dinorex logout ────────────────────────────────────────────────────────
program
    .command("logout")
    .description("Logout of your Dinorex account")
    .action(() => {
    banner();
    clearAuth();
    console.log(chalk.green("  ✓ Logged out successfully. 🦕\n"));
});
// ── dinorex whoami ────────────────────────────────────────────────────────
program
    .command("whoami")
    .description("Show current logged-in user")
    .action(() => {
    banner();
    const auth = loadAuth();
    if (!auth) {
        console.log(chalk.yellow("  Not logged in. Run: dinorex login\n"));
        return;
    }
    printUser(auth);
});
// ── dinorex scan [dir] ────────────────────────────────────────────────────
program
    .command("scan [directory]")
    .alias("init")
    .description("Scan a project and launch the interactive docs UI")
    .option("-p, --port <port>", "Port for the docs server", "4321")
    .option("--no-open", "Skip auto-opening browser")
    .action(async (directory = ".", options) => {
    banner();
    // ── Auth check ──
    const auth = await ensureAuth();
    printUser(auth);
    const targetDir = path.resolve(directory);
    const port = parseInt(options.port, 10);
    const { scanProject } = await import("./scanner.js");
    const { loadStore, saveStore, diffScan } = await import("./store.js");
    const { startServer } = await import("./server.js");
    console.log(chalk.dim(`  📂 ${targetDir}\n`));
    // ── 1. Scan files locally ──
    const s1 = ora({ text: "Scanning project files…", color: "green" }).start();
    let scanResult;
    try {
        scanResult = await scanProject(targetDir);
    }
    catch (e) {
        s1.fail(chalk.red(e.message));
        process.exit(1);
    }
    const { summary, collected } = scanResult;
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    if (!total) {
        s1.fail(chalk.red("No API files found. Make sure you're in an Express/Nest/Fastify project."));
        process.exit(1);
    }
    s1.succeed(chalk.green("Discovered: ") +
        chalk.white(`${summary.routes} routes  ${summary.controllers} controllers  ${summary.services} services  ${summary.models} models`));
    // ── 2. Check local cache vs changed files ──
    const allFiles = [
        ...collected.routes,
        ...collected.controllers,
        ...collected.services,
        ...collected.models,
    ];
    const stored = loadStore(targetDir);
    let spec;
    if (stored?.spec && stored?.hashes) {
        const diff = diffScan(stored.hashes, allFiles);
        const hasChanges = diff.newFiles.length || diff.changedFiles.length || diff.removedFiles.length;
        if (!hasChanges) {
            spec = stored.spec;
            console.log(chalk.dim("  ✓ No changes since last scan — using cached spec."));
        }
        else {
            // ── 3a. Send changed files to server ──
            const s2 = ora({
                text: `Sending ${diff.newFiles.length} new, ${diff.changedFiles.length} changed files to Dinorex…`,
                color: "cyan",
            }).start();
            try {
                const res = await apiRequest("/scan", {
                    method: "POST",
                    token: auth.token,
                    body: {
                        projectName: path.basename(targetDir),
                        routes: diff.newFiles.filter(f => collected.routes.find(r => r.path === f.path))
                            .concat(diff.changedFiles.filter(f => collected.routes.find(r => r.path === f.path))),
                        controllers: diff.newFiles.filter(f => collected.controllers.find(r => r.path === f.path))
                            .concat(diff.changedFiles.filter(f => collected.controllers.find(r => r.path === f.path))),
                        services: diff.newFiles.filter(f => collected.services.find(r => r.path === f.path))
                            .concat(diff.changedFiles.filter(f => collected.services.find(r => r.path === f.path))),
                        models: diff.newFiles.filter(f => collected.models.find(r => r.path === f.path))
                            .concat(diff.changedFiles.filter(f => collected.models.find(r => r.path === f.path))),
                        existingSpec: stored.spec,
                        removedFiles: diff.removedFiles,
                    },
                });
                spec = res.spec;
                saveStore(targetDir, { spec: res.spec, hashes: diff.newHashes, lastScan: new Date().toISOString() });
                const u = res.usage;
                const usageStr = u.plan === "PRO"
                    ? chalk.yellow("PRO — unlimited")
                    : chalk.dim(`${u.scansThisMonth}/${u.scanLimit} scans used`);
                s2.succeed(chalk.cyan("Incremental update complete. ") + usageStr);
            }
            catch (err) {
                s2.fail(chalk.red(err.message));
                process.exit(1);
            }
        }
    }
    else {
        // ── 3b. Full scan — send all files to server ──
        const s2 = ora({ text: "Sending files to Dinorex server for analysis…", color: "cyan" }).start();
        try {
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
            spec = res.spec;
            const { createHash } = await import("crypto");
            const hashes = {};
            for (const f of allFiles) {
                hashes[f.path] = { hash: createHash("md5").update(f.content).digest("hex") };
            }
            saveStore(targetDir, { spec: res.spec, hashes, lastScan: new Date().toISOString() });
            const u = res.usage;
            const usageStr = u.plan === "PRO"
                ? chalk.yellow("PRO — unlimited")
                : chalk.dim(`${u.scansRemaining} scans remaining this month`);
            const totalEndpoints = spec.collections.reduce((a, c) => a + c.endpoints.length, 0);
            s2.succeed(chalk.cyan(`${totalEndpoints} endpoints across ${spec.collections.length} collections — `) + usageStr);
        }
        catch (err) {
            s2.fail(chalk.red(err.message));
            process.exit(1);
        }
    }
    // ── 4. Start local UI server ──
    const s3 = ora({ text: `Starting docs UI on :${port}…`, color: "yellow" }).start();
    let srv;
    try {
        srv = await startServer(targetDir, { port, _cachedSpec: spec ?? null });
    }
    catch (e) {
        s3.fail(chalk.red(e.message));
        process.exit(1);
    }
    s3.succeed(chalk.yellow("Docs server running!"));
    console.log();
    console.log(chalk.green.bold(`  ✓ Dinorex docs → ${srv.url}`));
    console.log(chalk.dim("  Tip: run  dinorex scan  again to pick up new endpoints."));
    console.log(chalk.dim("  Ctrl+C to stop.\n"));
    if (options.open !== false) {
        try {
            const cmd = process.platform === "darwin"
                ? `open ${srv.url}`
                : process.platform === "win32"
                    ? `start ${srv.url}`
                    : `xdg-open ${srv.url}`;
            execSync(cmd, { stdio: "ignore" });
        }
        catch { }
    }
    process.on("SIGINT", () => {
        console.log(chalk.dim("\n  Dinorex stopped. 🦕\n"));
        process.exit(0);
    });
});
// ── dinorex upgrade ───────────────────────────────────────────────────────
program
    .command("upgrade")
    .description("Upgrade to Dinorex Pro for unlimited scans")
    .action(() => {
    banner();
    const auth = loadAuth();
    if (auth?.user.plan === "PRO") {
        console.log(chalk.yellow("  You're already on Pro! 🎉\n"));
        return;
    }
    console.log(chalk.green("  Upgrade to Dinorex Pro for unlimited scans.\n"));
    console.log(chalk.white("  → https://dinorex-server.onrender.com/upgrade\n"));
});
program.parse();
//# sourceMappingURL=cli.js.map