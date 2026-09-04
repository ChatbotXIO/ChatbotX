---
name: public-api-tooling
description: >-
  Work on ChatbotX public API clients, generated OpenAPI types, CLI commands,
  and MCP server tools. Use when changing packages/public-apis, apps/cli,
  apps/mcp-server, OpenAPI-derived tooling, workspace-token API behavior, or
  command-line access to ChatbotX APIs.
---

# Public API Tooling

Use this skill for the client/tooling surface around the public API. Pair with
`orpc-api` when adding or changing the builder endpoint that produces OpenAPI.

## Surfaces

```
packages/public-apis/
  src/generated/chatbotx.ts  OpenAPI-generated types
  src/apis/*.ts             Typed client methods + Zod input schemas
  src/lib/*                 API client, config, request helpers

apps/cli/
  src/index.ts              CLI entry
  src/openapi-loader.ts     OpenAPI tool discovery
  src/dynamic-executor.ts   Runtime endpoint execution
  src/commands/*            Static commands and config helpers

apps/mcp-server/
  src/openapi-loader.ts
  src/server/create-mcp-server.ts
  src/server/stdio-server.ts
  src/server/sse-server.ts
```

## Public API Client Pattern

Client modules in `packages/public-apis/src/apis/<domain>.ts` generally:

- Import `paths` from `../generated/chatbotx`.
- Derive input and output types from OpenAPI paths.
- Define Zod input schemas for CLI/MCP validation.
- Implement functions using `api.getClient().get/post/delete(...).json()`.
- Export domain APIs through `src/apis/index.ts` and package entrypoints.

When changing endpoint paths or response shapes, regenerate or update generated
OpenAPI types before adjusting typed clients.

## CLI and MCP Pattern

- CLI and MCP load OpenAPI metadata and execute operations dynamically.
- MCP registers raw JSON Schema tools through low-level MCP handlers so OpenAPI
  schemas can pass through.
- Workspace token auth uses `Authorization: Bearer <token>`.
- MCP API key comes from `CHATBOTX_API_KEY` or the provided runtime getter.
- Do not add ad-hoc duplicated endpoint definitions if OpenAPI can provide them.

## Adding or Changing an API Operation

1. Use `orpc-api` to add/update the builder oRPC procedure and OpenAPI metadata.
2. Make sure the procedure uses the correct auth stack:
   - session APIs: `authorizedAPI`
   - workspace token APIs: `workspaceTokenAuthAPIForScope("<scope>")` — every
     workspace-token endpoint must declare its resource scope (see
     `docs/developer/workspace-api-tokens.md`)
3. Refresh generated OpenAPI types if the workflow requires it.
4. Update `packages/public-apis/src/apis/<domain>.ts` schemas and functions.
5. Update CLI/MCP tests or smoke tests if dynamic discovery/args changed.

## Validation

Inspect scripts in each workspace `package.json`, then run the narrow checks:

```bash
pnpm --filter @chatbotx.io/public-apis test
pnpm --filter chatbotx-cli test
pnpm --filter chatbotx-mcp-server test
pnpm --filter builder check-types
```

Run broader lint/build if endpoint shape or generated types changed across
multiple packages.
