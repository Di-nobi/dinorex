import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
function buildContext(files) {
    return files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}
const SYSTEM_FULL = `You are an expert API analyst. Analyze source code (JavaScript OR TypeScript) and extract a complete API specification.

Supported frameworks and patterns — recognize ALL of these:
- Express / Fastify / Koa: router.get('/path', handler), app.post('/path', handler)
- NestJS decorators: @Controller('base'), @Get(':id'), @Post(), @Put(), @Patch(), @Delete(), @Body(), @Param(), @Query(), @UseGuards()
- TypeScript types & interfaces: extract field names/types from DTOs, interfaces, type aliases, class properties
- Mongoose/Sequelize/TypeORM/Prisma schemas: extract model fields and types
- tRPC routers: t.router({ ... }), publicProcedure, protectedProcedure — map to equivalent REST-style endpoints
- Zod/Joi/Yup schemas: extract field names and types as request/response body schemas
- Class-validator decorators: @IsString(), @IsEmail(), @IsNumber(), etc. → use as field type hints

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- Infer realistic example values from model/schema field names and types (TypeScript types count).
- Group endpoints into logical tags/collections (e.g. "Users", "Auth", "Products").
- Detect auth guards/middleware: @UseGuards(), @Roles(), authMiddleware, isAuthenticated, verifyToken, requireAuth, JwtAuthGuard, etc. → requiresAuth: true.
- For NestJS: combine @Controller('users') prefix with method decorator paths (e.g. @Get(':id') → /users/:id).
- Use DTO classes, interfaces, Zod schemas, or Mongoose models to build realistic request/response body examples.
- TypeScript optional fields (field?: type) → required: false. Non-optional → required: true.

Return this exact structure:
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

You understand JavaScript AND TypeScript, including: Express, Fastify, NestJS decorators (@Controller, @Get, @Post, etc.), DTOs, Zod/Joi schemas, Mongoose/TypeORM/Prisma models, and class-validator decorators.

You will receive:
1. The EXISTING spec (full JSON)
2. NEW or CHANGED source files to analyze

Your job:
- Extract endpoints from the new/changed files
- For each endpoint, check if it already exists in the spec (match by method + path)
- If it EXISTS and is unchanged: keep it as-is (don't re-add)
- If it EXISTS but the code changed: update it with improved info
- If it's NEW: add it to the correct collection (create the collection if needed)
- Remove endpoints whose source files were deleted (listed under REMOVED FILES)
- Keep all existing endpoints from files that weren't changed

Return the COMPLETE updated spec JSON (same structure as input). No markdown, no explanation, only JSON.`;
function parseJSON(raw) {
    const cleaned = raw
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
    try {
        return JSON.parse(cleaned);
    }
    catch (err) {
        throw new Error(`AI returned invalid JSON: ${err.message}\n\nSnippet: ${raw.slice(0, 300)}`);
    }
}
export async function analyzeWithAI(collected, projectName = "API") {
    const context = [
        collected.routes.length > 0
            ? "## ROUTES\n" + buildContext(collected.routes)
            : null,
        collected.controllers.length > 0
            ? "## CONTROLLERS\n" + buildContext(collected.controllers)
            : null,
        collected.services.length > 0
            ? "## SERVICES\n" + buildContext(collected.services)
            : null,
        collected.models.length > 0
            ? "## MODELS\n" + buildContext(collected.models)
            : null,
    ]
        .filter(Boolean)
        .join("\n\n---\n\n");
    const response = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 8000,
        system: SYSTEM_FULL,
        messages: [
            {
                role: "user",
                content: `Project: "${projectName}"\n\n${context}\n\nExtract all API endpoints and return the JSON spec.`,
            },
        ],
    });
    const block = response.content[0];
    if (block.type !== "text") {
        throw new Error("Unexpected response type from Anthropic API");
    }
    return parseJSON(block.text);
}
export async function analyzeIncremental(existingSpec, diff) {
    const { newFiles, changedFiles, removedFiles } = diff;
    if (!newFiles.length && !changedFiles.length && !removedFiles.length) {
        return { spec: existingSpec, changed: false };
    }
    const changedContext = [...newFiles, ...changedFiles]
        .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
        .join("\n\n");
    const removedContext = removedFiles.length > 0
        ? `\n\nREMOVED FILES (delete their endpoints):\n${removedFiles.join("\n")}`
        : "";
    const response = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 8000,
        system: SYSTEM_INCREMENTAL,
        messages: [
            {
                role: "user",
                content: `EXISTING SPEC:\n${JSON.stringify(existingSpec, null, 2)}\n\nNEW/CHANGED FILES:\n${changedContext}${removedContext}\n\nReturn the complete updated spec.`,
            },
        ],
    });
    const block = response.content[0];
    if (block.type !== "text") {
        throw new Error("Unexpected response type from Anthropic API");
    }
    const updated = parseJSON(block.text);
    return { spec: updated, changed: true };
}
//# sourceMappingURL=agent.js.map