import type { OpenAPI } from "@orpc/openapi"

/**
 * `"default"` = shipped in `tools/list` on every MCP connection. `"hidden"`
 * (or the field absent — see `mcpSpec` below) = reachable only through the
 * `search_tools` / `call_tool` meta-tools. We cannot ask every one of the
 * ~350 public operations to opt out individually, so the polarity is
 * inverted: opt IN to `"default"` on the ~40 that should always be visible.
 */
type McpVisibility = "default" | "hidden"

export type McpRouteMeta = {
  /** Absent ⇒ treated as `"hidden"` by the mcp-server loader. */
  visibility?: McpVisibility
  /**
   * Exempts this operation from scope-based `tools/list` filtering —
   * reserved for the small set of discovery endpoints (`capabilities.get`,
   * `token.get`) that a token must be able to *see* even when it lacks the
   * scope those endpoints themselves require, so the 403 body is visible to
   * the agent instead of the tool disappearing without a trace.
   */
  alwaysVisible?: boolean
  /** Absent ⇒ the mcp-server loader infers this from the HTTP method. */
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
}

/**
 * The `@orpc/contract` route-spec type (`OpenAPI.OperationObject`, aliased
 * from `openapi-types`' `OpenAPIV3_1.OperationObject`) has no vendor
 * extension field, so `x-mcp` is added here rather than via module
 * augmentation (this repo's lint forbids `namespace`, the mechanism TS
 * declaration merging needs for a third-party namespaced interface).
 */
export type OperationObjectWithMcp = OpenAPI.OperationObject & {
  "x-mcp"?: McpRouteMeta & { scope?: string }
}

/**
 * Route-level opt-in used as `.route({ spec: mcpSpec({ visibility: "default" }) })`.
 *
 * Must be the function form of `spec`, never a plain object — the OpenAPI
 * generator treats an object `spec` as a full replacement of the generated
 * operation (dropping `parameters`/`requestBody`/`responses`), while the
 * function form merges into what was already generated.
 */
export const mcpSpec =
  (meta: McpRouteMeta) =>
  (current: OpenAPI.OperationObject): OperationObjectWithMcp => {
    const existing = (current as OperationObjectWithMcp)["x-mcp"]
    return {
      ...current,
      "x-mcp": { ...existing, ...meta },
    }
  }
