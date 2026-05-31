import yaml from "js-yaml";

export function generateSwaggerSpec(spec) {
  const openapi = {
    openapi: "3.0.3",
    info: {
      title: spec.projectName,
      description: spec.description,
      version: spec.version,
    },
    servers: [{ url: spec.baseUrl }],
    tags: spec.collections.map((c) => ({ name: c.name, description: c.description })),
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  };

  for (const col of spec.collections) {
    for (const ep of col.endpoints) {
      if (!openapi.paths[ep.path]) {
        openapi.paths[ep.path] = {};
      }

      const operation = {
        tags: [col.name],
        summary: ep.summary,
        description: ep.description,
        operationId: ep.id,
        parameters: [],
        responses: {},
      };

      if (ep.requiresAuth) {
        operation.security = [{ bearerAuth: [] }];
      }

      // Path params
      for (const p of ep.pathParams || []) {
        operation.parameters.push({
          name: p.name,
          in: "path",
          required: true,
          description: p.description,
          schema: { type: p.type || "string", example: p.example },
        });
      }

      // Query params
      for (const q of ep.queryParams || []) {
        operation.parameters.push({
          name: q.name,
          in: "query",
          required: false,
          description: q.description,
          schema: { type: q.type || "string", example: q.example },
        });
      }

      // Request body
      if (ep.requestBody && ["post", "put", "patch"].includes(ep.method.toLowerCase())) {
        const properties = {};
        const required = [];

        for (const [field, def] of Object.entries(ep.requestBody.schema || {})) {
          properties[field] = {
            type: def.type || "string",
            example: def.example,
            description: def.description,
          };
          if (def.required) required.push(field);
        }

        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties,
                ...(required.length > 0 ? { required } : {}),
              },
            },
          },
        };
      }

      // Responses
      for (const [statusCode, res] of Object.entries(ep.responses || {})) {
        operation.responses[statusCode] = {
          description: res.description,
          ...(res.example
            ? {
                content: {
                  "application/json": {
                    schema: { type: "object", example: res.example },
                  },
                },
              }
            : {}),
        };
      }

      if (Object.keys(operation.responses).length === 0) {
        operation.responses["200"] = { description: "Success" };
      }

      if (operation.parameters.length === 0) delete operation.parameters;

      openapi.paths[ep.path][ep.method.toLowerCase()] = operation;
    }
  }

  return yaml.dump(openapi, { noRefs: true, lineWidth: 120 });
}