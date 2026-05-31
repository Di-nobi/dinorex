/**
 * agent.groq.ts — Free Groq/Llama3 version of the Dinorex AI agent.
 *
 * Get a free API key at: https://console.groq.com
 * Set it:  export GROQ_API_KEY=gsk_your_key_here
 */

import type { ApiSpec, DiffResult } from "./store.js";
import type { CollectedFiles } from "./scanner.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const MAX_CHARS = 12000;

interface FileWithKind {
  path: string;
  content: string;
  kind: "ROUTE" | "CONTROLLER" | "SERVICE" | "MODEL";
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const SYSTEM_FULL = `You are an expert API analyst. Analyze source code (JavaScript OR TypeScript) and extract a complete API specification.

Supported frameworks — recognize ALL of these:
- Express / Fastify / Koa: router.get('/path', handler), app.post('/path', handler)
- NestJS decorators: @Controller('base'), @Get(':id'), @Post(), @Put(), @Patch(), @Delete(), @Body(), @Param(), @Query(), @UseGuards()
- TypeScript DTOs, interfaces, type aliases, class properties
- Mongoose / Sequelize / TypeORM / Prisma schemas
- Zod / Joi / Yup schemas: extract field names and types
- class-validator decorators: @IsString(), @IsEmail(), etc.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no code fences.
- Infer realistic example values from model/schema field names and types.
- Group endpoints into logical collections (e.g. "Users", "Auth", "Products").
- Detect auth guards: @UseGuards(), authMiddleware, isAuthenticated, verifyToken, requireAuth, JwtAuthGuard → requiresAuth: true.
- For NestJS: combine @Controller('users') prefix with method paths (@Get(':id') → /users/:id).
- TypeScript optional fields (field?: type) → required: false.

Return ONLY this JSON structure, nothing else:
{
  "projectName": "string",
  "baseUrl": "http://localhost:3000",
  "version": "1.0.0",
  "description": "string",
  "collections": [
    {
      "name": "string",
      "description": "string",
      "endpoints": [
        {
          "id": "unique-kebab-slug",
          "method": "GET|POST|PUT|PATCH|DELETE",
          "path": "/api/resource/:id",
          "summary": "Short title",
          "description": "Longer description",
          "requiresAuth": false,
          "pathParams": [{ "name": "id", "type": "string", "description": "...", "example": "abc123" }],
          "queryParams": [{ "name": "page", "type": "integer", "description": "...", "example": 1 }],
          "requestBody": {
            "contentType": "application/json",
            "schema": {
              "fieldName": { "type": "string", "example": "value", "required": true, "description": "..." }
            }
          },
          "responses": {
            "200": { "description": "Success", "example": {} },
            "400": { "description": "Bad Request" },
            "401": { "description": "Unauthorized" },
            "404": { "description": "Not Found" },
            "500": { "description": "Server Error" }
          }
        }
      ]
    }
  ]
}`;

const SYSTEM_INCREMENTAL = `You are an expert API analyst doing an INCREMENTAL update to an existing API spec.

You understand JavaScript AND TypeScript including Express, NestJS decorators, DTOs, Zod schemas, Mongoose/TypeORM/Prisma models.

You will receive:
1. The EXISTING spec (full JSON)
2. NEW or CHANGED source files to analyze

Your job:
- Extract endpoints from new/changed files
- If endpoint already exists (same method + path): update it if code changed, keep it if unchanged
- If it is NEW: add it to the correct collection (create collection if needed)
- Remove endpoints whose source files are listed under REMOVED FILES
- Keep all existing endpoints from unchanged files

Return the COMPLETE updated spec JSON. No markdown, no explanation, ONLY JSON.`;

async function callGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set.\nGet a free key at https://console.groq.com\nThen run: export GROQ_API_KEY=gsk_your_key_here"
    );
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as GroqResponse;
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJSON(raw: string): ApiSpec {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in response.\n\nSnippet: ${raw.slice(0, 300)}`);
  }

  const jsonStr = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(jsonStr) as ApiSpec;
  } catch (err) {
    throw new Error(
      `Invalid JSON from Groq: ${(err as Error).message}\n\nSnippet: ${jsonStr.slice(0, 300)}`
    );
  }
}

function batchFiles(files: FileWithKind[]): FileWithKind[][] {
  const batches: FileWithKind[][] = [];
  let current: FileWithKind[] = [];
  let size = 0;

  for (const f of files) {
    const len = f.content.length + f.path.length + 20;
    if (size + len > MAX_CHARS && current.length > 0) {
      batches.push(current);
      current = [];
      size = 0;
    }
    const truncated: FileWithKind = { ...f, content: f.content.slice(0, MAX_CHARS) };
    current.push(truncated);
    size += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function mergeSpecs(specs: ApiSpec[]): ApiSpec {
  const base = specs[0];
  const collectionsMap: Record<string, ApiSpec["collections"][number]> = {};

  for (const spec of specs) {
    for (const col of spec.collections) {
      if (!collectionsMap[col.name]) {
        collectionsMap[col.name] = { ...col, endpoints: [] };
      }
      for (const ep of col.endpoints) {
        const key = `${ep.method}:${ep.path}`;
        const exists = collectionsMap[col.name].endpoints.some(
          (e) => `${e.method}:${e.path}` === key
        );
        if (!exists) collectionsMap[col.name].endpoints.push(ep);
      }
    }
  }

  return { ...base, collections: Object.values(collectionsMap) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeWithAI(
  collected: CollectedFiles,
  projectName = "API"
): Promise<ApiSpec> {
  const allFiles: FileWithKind[] = [
    ...collected.routes.map((f) => ({ ...f, kind: "ROUTE" as const })),
    ...collected.controllers.map((f) => ({ ...f, kind: "CONTROLLER" as const })),
    ...collected.services.map((f) => ({ ...f, kind: "SERVICE" as const })),
    ...collected.models.map((f) => ({ ...f, kind: "MODEL" as const })),
  ];

  const batches = batchFiles(allFiles);
  console.log(`\n  📦 Sending ${batches.length} batch(es) to Groq (${allFiles.length} files total)...`);

  const partialSpecs: ApiSpec[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const context = batch
      .map((f) => `### [${f.kind}] ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
      .join("\n\n");

    const userMessage = `Project name: "${projectName}" (batch ${i + 1} of ${batches.length})\n\n${context}\n\nExtract all API endpoints found in these files and return ONLY the JSON spec.`;

    const raw = await callGroq(SYSTEM_FULL, userMessage);
    const partial = parseJSON(raw);
    partialSpecs.push(partial);

    if (i < batches.length - 1) await sleep(1000);
  }

  return batches.length === 1 ? partialSpecs[0] : mergeSpecs(partialSpecs);
}

export async function analyzeIncremental(
  existingSpec: ApiSpec,
  diff: DiffResult
): Promise<{ spec: ApiSpec; changed: boolean }> {
  const { newFiles, changedFiles, removedFiles } = diff;

  if (!newFiles.length && !changedFiles.length && !removedFiles.length) {
    return { spec: existingSpec, changed: false };
  }

  const filesToAnalyze = [...newFiles, ...changedFiles];
  const removedContext =
    removedFiles.length > 0
      ? `\n\nREMOVED FILES (delete their endpoints):\n${removedFiles.join("\n")}`
      : "";

  const specStr = JSON.stringify(existingSpec, null, 2);
  const specTruncated =
    specStr.length > 6000 ? specStr.slice(0, 6000) + "\n... [truncated]" : specStr;

  const changedContext = filesToAnalyze
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join("\n\n");

  const userMessage = `EXISTING SPEC:\n${specTruncated}\n\nNEW/CHANGED FILES:\n${changedContext}${removedContext}\n\nReturn the complete updated spec JSON only.`;

  const raw = await callGroq(SYSTEM_INCREMENTAL, userMessage);
  const updated = parseJSON(raw);
  return { spec: updated, changed: true };
}