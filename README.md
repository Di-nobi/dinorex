# 🦕 Dinorex

> AI-powered API documentation generator. One command, full docs.

Dinorex scans your Node.js project — routes, controllers, services, and DB models — and uses AI to automatically generate an interactive docs UI, a Postman collection, and a Swagger/OpenAPI file.

---

## Install

```bash
npm install -g dinorex
```

Or use without installing (requires Node 18+):

```bash
npx dinorex scan
```

---

# Or pass it directly every time
dinorex scan --api-key sk-ant-your-key-here
```

---

## Usage

### Scan your project and open docs
```bash
cd your-project/
dinorex scan
# Opens http://localhost:4321 automatically
```

### Scan a specific folder
```bash
dinorex scan ./backend --port 5000
```

### After adding new endpoints — smart rescan
```bash
dinorex scan
# Dinorex detects only new/changed files and updates the spec incrementally
# No need to re-analyze everything from scratch
```

### Force a full re-analysis
```bash
dinorex scan --full
```

### Generate files only (no UI server)
```bash
dinorex generate ./backend --out ./docs
# Outputs: *-postman.json, *-openapi.yaml, *-spec.json
```

---

## What gets scanned

| Pattern | Examples |
|---|---|
| Routes | `routes/`, `*route*.js`, `*router*.js` |
| Controllers | `controllers/`, `*controller*.js` |
| Services | `services/`, `*service*.js` |
| Models/Schemas | `models/`, `schemas/`, `*model*.js`, `*schema*.js` |

Ignores: `node_modules`, `dist`, `build`, `.git`, test files.

---

## Output

- **Interactive UI** at `http://localhost:4321` — browse, search, and test endpoints live
- **Postman Collection** — download and import directly into Postman
- **Swagger/OpenAPI YAML** — import into any OpenAPI-compatible tool

---

## Works with

- Express.js
- Fastify
- NestJS
- Koa
- Any Node.js framework that uses route files

---

## Cache & incremental updates

Dinorex stores a `.dinorex/spec.json` file in your project directory (auto-gitignored). On subsequent runs it only re-analyzes new or changed files — making rescans much faster.

---

## Options

```
dinorex scan [directory]
  -p, --port <port>    Port to run docs server (default: 4321)
  --no-open            Don't auto-open the browser
  --api-key <key>      Anthropic API key

dinorex generate [directory]
  --out <dir>          Output directory (default: ./dinorex-output)
  --api-key <key>      Anthropic API key
```