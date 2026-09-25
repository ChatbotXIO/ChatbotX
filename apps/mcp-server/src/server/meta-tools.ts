import {
  type DynamicTool,
  getCachedTools,
  getToolByName,
  toSnakeCase,
} from "../openapi-loader"
import {
  errorResult,
  executeTool,
  jsonResult,
  type ToolCallResult,
} from "./execute-tool"
import { expandSearchQuery, looksNonEnglish } from "./search/normalize"
import { distinctResourceGroups, rankTools } from "./search/rank"

/**
 * Static tool definitions for the two meta-tools that give an agent access
 * to the ~300 operations excluded from `tools/list` by `visibility: "hidden"`
 * (see `apps/builder/src/lib/orpc/mcp-annotations.ts`). These never come
 * from the OpenAPI spec — they are the fixed entry point into it.
 */
export const META_TOOLS = [
  {
    name: "search_tools",
    description:
      "Search the full ChatbotX catalog for hidden or unlisted tool definitions; this never executes a tool. Direct listed tools may be called directly. Search with one action plus one resource, inspect each returned inputSchema, then call call_tool with the exact returned name.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Short business intent: one action plus one resource (e.g. "add tag to contact"), in English or supported Vietnamese, Spanish, French, or Chinese. An exact tool name also works. Do not combine independent tasks.',
        },
        limit: {
          type: "number",
          description: "Max results (default 10, max 25).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "call_tool",
    description:
      'Execute a hidden tool by the exact name returned by search_tools (dotted names like "contacts.get" are also accepted). Pass a flat arguments object matching inputSchema; resolve named entities first unless the user supplied a stable ID, email, or phone.',
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Exact executable name returned by search_tools.",
        },
        arguments: {
          type: "object",
          description:
            "JSON object containing every field declared by the selected inputSchema. Read its schema and lookup requirements first; use {} only for a no-input tool. Do not wrap fields in body, params, or workspaceId unless the selected schema declares them.",
        },
      },
      required: ["name"],
    },
  },
] as const

const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 25
const MAX_NAME_SUGGESTIONS = 3

/**
 * Ranks the full cached catalog against an English `query` and returns the
 * top matches. See `search/rank.ts` for the IDF-weighted scoring model.
 */
export function searchTools(query: string, limit?: number): DynamicTool[] {
  const cappedLimit = Math.min(
    Math.max(
      limit !== undefined && Number.isFinite(limit)
        ? limit
        : DEFAULT_SEARCH_LIMIT,
      1,
    ),
    MAX_SEARCH_LIMIT,
  )
  return rankTools(getCachedTools(), query, cappedLimit)
}

/**
 * Builds the resource-group suffix shared by every zero/weak-match hint, or
 * an empty string when the catalog hasn't loaded any tags yet.
 */
function resourceGroupSuffix(): string {
  const groups = distinctResourceGroups(getCachedTools())
  return groups.length > 0 ? ` Resource groups: ${groups.join(", ")}.` : ""
}

/**
 * Validates a `search_tools` query and returns matched tool definitions.
 * Zero or non-English results include a hint that helps the caller retry
 * without executing a catalog tool.
 */
export type SearchMatch = Pick<
  DynamicTool,
  "name" | "description" | "inputSchema"
>
export type SearchToolsResult = { matches: SearchMatch[]; hint?: string }

export function handleSearchTools(
  args: Record<string, unknown>,
): ToolCallResult {
  const query = args.query
  if (typeof query !== "string" || query.trim().length === 0) {
    return errorResult("search_tools requires a non-empty 'query' string.")
  }
  const limit = typeof args.limit === "number" ? args.limit : undefined
  const isNonEnglishQuery = looksNonEnglish(query)
  const queryWasExpanded = expandSearchQuery(query) !== query

  const matches: SearchMatch[] = searchTools(query, limit).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))

  if (matches.length === 0) {
    const hint = isNonEnglishQuery
      ? `No tool matched "${query}". Translate the request into one English action plus one resource (e.g. "add tag to contact") and call search_tools again.${resourceGroupSuffix()}`
      : `No tool matched "${query}". Rephrase in English with one action and one resource.${resourceGroupSuffix()}`
    return jsonResult({ matches: [], hint })
  }

  if (queryWasExpanded) {
    return jsonResult({
      matches,
      hint: "Recognized supported native-language action/resource terms and ranked their English catalog equivalents.",
    })
  }

  if (isNonEnglishQuery) {
    return jsonResult({
      matches,
      hint: `Matches were ranked from a non-English query; translating "${query}" into English (one action plus one resource) before calling search_tools again usually ranks better.`,
    })
  }

  return jsonResult({ matches } satisfies SearchToolsResult)
}

/**
 * Resolves a tool name for `call_tool`, accepting the exact executable
 * name `search_tools` returns as well as a raw dotted/camelCase
 * `operationId` (e.g. "contacts.get", "contactsGet") by re-deriving the
 * snake_case form the loader would have produced. This tolerates a model
 * echoing back the API-style label it saw in a description instead of the
 * tool name it was actually given.
 */
function resolveToolName(name: string): DynamicTool | undefined {
  return getToolByName(name) ?? getToolByName(toSnakeCase(name))
}

function unknownToolMessage(name: string): string {
  const suggestions = rankTools(getCachedTools(), name, MAX_NAME_SUGGESTIONS)
  if (suggestions.length === 0) {
    return `Unknown tool: ${name}`
  }
  return `Unknown tool: ${name}. Closest matches: ${suggestions
    .map((tool) => tool.name)
    .join(", ")}.`
}

/**
 * `call_tool` handler — looks up `name` against the *entire* cached tool
 * list (no `visibility` filter; that filter only governs `tools/list`) and
 * executes it exactly like a direct `tools/call` would.
 */
export async function handleCallTool(
  args: Record<string, unknown>,
  apiKey: string,
): Promise<ToolCallResult> {
  const name = args.name
  if (typeof name !== "string" || name.trim().length === 0) {
    return errorResult("call_tool requires a non-empty 'name' string.")
  }

  const tool = resolveToolName(name)
  if (!tool) {
    return errorResult(unknownToolMessage(name))
  }

  const suppliedArguments = args.arguments
  if (
    suppliedArguments !== undefined &&
    (typeof suppliedArguments !== "object" ||
      suppliedArguments === null ||
      Array.isArray(suppliedArguments) ||
      Object.getPrototypeOf(suppliedArguments) !== Object.prototype)
  ) {
    return errorResult("call_tool 'arguments' must be a JSON object.")
  }

  return await executeTool(
    tool,
    (suppliedArguments ?? {}) as Record<string, unknown>,
    apiKey,
  )
}
