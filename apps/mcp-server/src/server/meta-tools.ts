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
import { looksNonEnglish } from "./search/normalize"
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
      "Search the full ChatbotX tool catalog for tool definitions, not workspace records, and never execute a tool. The catalog is English: use one action plus one resource written in English, or an exact tool name, translating the user's intent first if needed. The result contains `matches`, each with its full inputSchema; read it, then call the exact returned name with call_tool.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Short business intent written in English: one action plus one resource (e.g. "add tag to contact"), or an exact tool name. Translate the user\'s intent into English first. Do not combine independent tasks.',
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
      'Execute a tool by the exact name returned by search_tools (dotted names like "contacts.get" are also accepted and normalized). The selected tool\'s inputSchema defines every argument. Example: {"name":"contacts_get","arguments":{"identifier":"email:ada@example.com"}}.',
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

  const matches: SearchMatch[] = searchTools(query, limit).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))

  if (matches.length === 0) {
    const hint = isNonEnglishQuery
      ? `The tool catalog is English-only and "${query}" is not in English. Translate the request into one English action plus one resource (e.g. "add tag to contact") and call search_tools again.${resourceGroupSuffix()}`
      : `No tool matched "${query}". Rephrase in English with one action and one resource.${resourceGroupSuffix()}`
    return jsonResult({ matches: [], hint })
  }

  // A non-English query that still scored > 0 (e.g. it mixed in an English
  // word) got ranked against an English catalog rather than translated —
  // matches may be present but weaker than a fully-English query would
  // produce, so nudge the caller toward the higher-quality path without
  // withholding the matches it already found.
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
 * Checks `arguments` against the selected tool's `required` inputSchema
 * fields before any HTTP request is made, so a missing field is reported
 * immediately instead of round-tripping through the real API's 422. Also
 * flags the common wrapper mistake of nesting every field under a single
 * `body`/`params`/`input` key the schema never declared — call_tool's own
 * description already asks agents not to do this, but cheaper models do it
 * anyway, and the resulting error is otherwise a generic "missing field"
 * for every declared field at once.
 */
function preflightArgumentError(
  tool: DynamicTool,
  args: Record<string, unknown>,
): string | undefined {
  const required = tool.inputSchema.required ?? []
  const missing = required.filter(
    (key) => args[key] === undefined || args[key] === null,
  )
  if (missing.length === 0) {
    return
  }

  const wrapperKeys = ["body", "params", "input"]
  const declaredKeys = new Set(Object.keys(tool.inputSchema.properties))
  const suspectedWrapper = wrapperKeys.find((key) => {
    const value = args[key]
    return (
      !declaredKeys.has(key) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    )
  })

  const missingList = missing.join(", ")
  if (suspectedWrapper) {
    return `Missing required field(s): ${missingList}. Arguments must be a flat object matching inputSchema — found a "${suspectedWrapper}" wrapper instead of passing its fields at the top level.`
  }
  return `Missing required field(s): ${missingList}. See the tool's inputSchema for the full shape.`
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

  const toolArguments = (suppliedArguments ?? {}) as Record<string, unknown>

  const preflightError = preflightArgumentError(tool, toolArguments)
  if (preflightError) {
    return errorResult(preflightError)
  }

  return await executeTool(tool, toolArguments, apiKey)
}
