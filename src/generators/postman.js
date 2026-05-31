export function generatePostmanCollection(spec) {
  const collection = {
    info: {
      name: spec.projectName,
      description: spec.description,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      version: spec.version,
    },
    variable: [
      {
        key: "baseUrl",
        value: spec.baseUrl,
        type: "string",
      },
    ],
    item: [],
  };

  for (const col of spec.collections) {
    const folder = {
      name: col.name,
      description: col.description,
      item: [],
    };

    for (const ep of col.endpoints) {
      const url = {
        raw: `{{baseUrl}}${ep.path}`,
        host: ["{{baseUrl}}"],
        path: ep.path.split("/").filter(Boolean).map((p) => (p.startsWith(":") ? `{{${p.slice(1)}}}` : p)),
      };

      if (ep.queryParams && ep.queryParams.length > 0) {
        url.query = ep.queryParams.map((q) => ({
          key: q.name,
          value: String(q.example ?? ""),
          description: q.description,
        }));
      }

      if (ep.pathParams && ep.pathParams.length > 0) {
        url.variable = ep.pathParams.map((p) => ({
          key: p.name,
          value: String(p.example ?? ""),
          description: p.description,
        }));
      }

      const request = {
        method: ep.method,
        header: [
          { key: "Content-Type", value: "application/json" },
          ...(ep.requiresAuth
            ? [{ key: "Authorization", value: "Bearer {{token}}", description: "Auth token" }]
            : []),
        ],
        url,
        description: ep.description,
      };

      if (ep.requestBody && ["POST", "PUT", "PATCH"].includes(ep.method)) {
        const bodyExample = {};
        for (const [field, def] of Object.entries(ep.requestBody.schema || {})) {
          bodyExample[field] = def.example ?? "";
        }
        request.body = {
          mode: "raw",
          raw: JSON.stringify(bodyExample, null, 2),
          options: { raw: { language: "json" } },
        };
      }

      folder.item.push({
        name: ep.summary,
        request,
        response: [],
      });
    }

    collection.item.push(folder);
  }

  return collection;
}