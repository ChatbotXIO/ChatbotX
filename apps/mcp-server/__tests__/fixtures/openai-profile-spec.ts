/**
 * A minimal public spec for the OpenAI profile tests: a few profile reads and
 * writes (including an outbound and a destructive one), and a deferred
 * operation the profile must not serve. The full contract is checked against
 * the live spec in apps/builder/__tests__/public-spec-mcp.test.ts.
 */
const read = (scope: string, extra: Record<string, unknown> = {}) => ({
  visibility: "default",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  hitlPolicy: "none",
  scope,
  ...extra,
})

const json = (schema: unknown) => ({
  content: { "application/json": { schema } },
})

const ok = (schema: unknown) => ({
  "200": { description: "OK", ...json(schema) },
})

const pathParam = (name: string) => ({
  in: "path",
  name,
  required: true,
  schema: { type: "string" },
})

const contact = {
  type: "object",
  properties: { id: { type: "string" }, firstName: { type: "string" } },
  required: ["id"],
}

export const openAiProfileSpec = {
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/v1/contacts": {
      get: {
        operationId: "contacts.list",
        summary: "List contacts",
        parameters: [{ in: "query", name: "name", schema: { type: "string" } }],
        responses: ok({
          type: "object",
          properties: { data: { type: "array", items: contact } },
        }),
        "x-mcp": read("contacts"),
      },
      post: {
        operationId: "contacts.create",
        summary: "Create contact",
        requestBody: json({
          type: "object",
          properties: {
            channel: { type: "string" },
            email: { type: "string" },
            gender: { type: "string", enum: ["male", "female", "unknown"] },
            inboxId: { type: "string" },
          },
          required: ["channel", "email", "gender", "inboxId"],
        }),
        responses: ok(contact),
        "x-mcp": {
          visibility: "default",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
          hitlPolicy: "confirm_diff",
          scope: "contacts",
        },
      },
    },
    "/v1/contacts/{identifier}/messages": {
      post: {
        operationId: "contacts.sendMessage",
        summary: "Send message to contact",
        parameters: [pathParam("identifier")],
        requestBody: json({
          type: "object",
          properties: { inboxId: { type: "string" }, text: { type: "string" } },
        }),
        responses: ok({}),
        "x-mcp": {
          visibility: "default",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
          hitlPolicy: "confirm_outbound",
          scope: "inbox",
        },
      },
    },
    "/v1/contacts/{identifier}/tags/by-name": {
      post: {
        operationId: "contacts.addTagsByName",
        summary: "Add tags to contact by name",
        parameters: [pathParam("identifier")],
        requestBody: json({
          type: "object",
          properties: { tags: { type: "array", items: { type: "string" } } },
          required: ["tags"],
        }),
        responses: ok({}),
        "x-mcp": {
          visibility: "default",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          hitlPolicy: "confirm_diff",
          scope: "contacts",
        },
      },
    },
    "/v1/contacts/{identifier}/flows": {
      post: {
        operationId: "contacts.sendFlow",
        summary: "Send flow to contact",
        parameters: [pathParam("identifier")],
        responses: ok({}),
        "x-mcp": {
          visibility: "default",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
          hitlPolicy: "confirm_outbound",
          scope: "flows",
        },
      },
    },
    "/v1/broadcasts": {
      get: {
        operationId: "broadcasts.list",
        summary: "List broadcasts",
        responses: ok({
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { type: "object", properties: { id: { type: "string" } } },
            },
          },
        }),
        "x-mcp": read("broadcasts"),
      },
    },
    "/v1/broadcasts/{id}/stop": {
      post: {
        operationId: "broadcasts.stop",
        summary: "Stop broadcast",
        parameters: [pathParam("id")],
        responses: ok({
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        }),
        "x-mcp": {
          visibility: "default",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
          hitlPolicy: "confirm_destructive",
          scope: "broadcasts",
        },
      },
    },
    "/v1/token": {
      get: {
        operationId: "token.get",
        summary: "Get calling token workspace id, permission, and scopes",
        responses: ok({
          type: "object",
          properties: {
            workspaceId: { type: "string" },
            principal: { type: "object", properties: {} },
          },
        }),
        "x-mcp": read("contacts", { alwaysVisible: true }),
      },
    },
  },
}
