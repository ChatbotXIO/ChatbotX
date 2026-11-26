/**
 * A minimal public spec for the Claude profile tests: profile reads and
 * writes, a default-visible operation the profile excludes, and a hidden one.
 */
export const claudeProfileSpec = {
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/v1/contacts": {
      get: {
        operationId: "contacts.list",
        summary: "List contacts",
        description:
          "List contacts. Read one with `contacts.get`. Bulk-delete with `contacts.bulkDelete`.",
        parameters: [{ in: "query", name: "name", schema: { type: "string" } }],
        "x-mcp": {
          visibility: "default",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          hitlPolicy: "none",
        },
      },
      post: {
        operationId: "contacts.create",
        summary: "Create a contact",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description:
                      "Display name. Merge duplicates with `contacts.merge`.",
                  },
                },
                required: ["name"],
              },
            },
          },
        },
        // Route metadata that understates a write: the profile must not.
        "x-mcp": {
          visibility: "default",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
          hitlPolicy: "confirm_diff",
        },
      },
    },
    "/v1/contacts/{identifier}": {
      get: {
        operationId: "contacts.get",
        summary: "Get a contact",
        parameters: [
          {
            in: "path",
            name: "identifier",
            required: true,
            schema: { type: "string" },
          },
        ],
        "x-mcp": {
          visibility: "default",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          hitlPolicy: "none",
        },
      },
    },
    "/v1/connections": {
      post: {
        operationId: "connections.create",
        summary: "Start connecting a channel",
        "x-mcp": {
          visibility: "default",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
          hitlPolicy: "confirm_diff",
        },
      },
    },
    "/v1/contacts/bulk-delete": {
      post: {
        operationId: "contacts.bulkDelete",
        summary: "Delete many contacts",
        "x-mcp": { visibility: "hidden", hitlPolicy: "confirm_destructive" },
      },
    },
  },
}
