import {
  type DynamicTool,
  getCachedTools,
  getToolByName,
} from "../openapi-loader"
import {
  errorResult,
  executeTool,
  jsonResult,
  type ToolCallResult,
} from "./execute-tool"

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
      "Search the full ChatbotX API for tools not listed in tools/list. " +
      "Returns each match's name, description and inputSchema. " +
      "Use when no listed tool fits — then run it with call_tool.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What you want to do, in plain language.",
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
      "Execute any ChatbotX tool by name, including ones not in tools/list.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Exact tool name from search_tools.",
        },
        arguments: { type: "object", description: "Arguments for that tool." },
      },
      required: ["name"],
    },
  },
] as const

const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 25
// A name/description-token match is worth less than a whole-phrase match,
// and a name match outweighs a description match — a query naming the
// resource ("tags") should rank `tags_list` over an unrelated tool whose
// long description happens to mention tags in passing.
const NAME_TOKEN_WEIGHT = 2
const DESCRIPTION_TOKEN_WEIGHT = 1
const PHRASE_MATCH_BONUS = 3

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

type ToolTokens = { name: Set<string>; description: Set<string> }

// Keyed by the `DynamicTool` object itself (not its name): `openapi-loader`
// hands out a fresh array of tool objects on every spec refresh, so a stale
// entry is naturally unreachable and garbage-collected — no manual
// invalidation needed when the spec changes.
const toolTokensCache = new WeakMap<DynamicTool, ToolTokens>()

function getToolTokens(tool: DynamicTool): ToolTokens {
  const cached = toolTokensCache.get(tool)
  if (cached) {
    return cached
  }
  const tokens: ToolTokens = {
    name: new Set(tokenize(tool.name)),
    description: new Set(tokenize(tool.description)),
  }
  toolTokensCache.set(tool, tokens)
  return tokens
}

function scoreTool(
  tool: DynamicTool,
  queryTokens: string[],
  queryPhrase: string,
): number {
  const { name: nameTokens, description: descriptionTokens } =
    getToolTokens(tool)

  let score = 0
  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      score += NAME_TOKEN_WEIGHT
    }
    if (descriptionTokens.has(token)) {
      score += DESCRIPTION_TOKEN_WEIGHT
    }
  }

  if (
    queryPhrase.length > 0 &&
    `${tool.name} ${tool.description}`.toLowerCase().includes(queryPhrase)
  ) {
    score += PHRASE_MATCH_BONUS
  }

  return score
}

/**
 * Ranks every cached tool (not just the `visibility: "default"` set —
 * that's the whole point) against the query and returns the top matches.
 * Zero-scoring tools are dropped rather than padded in at the tail: an
 * agent acting on a bad match is worse than an agent getting an empty list
 * and rephrasing.
 */
export function searchTools(query: string, limit?: number): DynamicTool[] {
  const queryPhrase = query.trim().toLowerCase()
  const queryTokens = tokenize(query)
  const cappedLimit = Math.min(
    Math.max(
      limit !== undefined && Number.isFinite(limit)
        ? limit
        : DEFAULT_SEARCH_LIMIT,
      1,
    ),
    MAX_SEARCH_LIMIT,
  )

  return getCachedTools()
    .map((tool) => ({ tool, score: scoreTool(tool, queryTokens, queryPhrase) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      // Tie-break: a read fits more agent intents safely than a write, and
      // a shorter name is usually the more general/canonical operation
      // (`tags_list` over `contacts_list_tags`).
      const aIsGet = a.tool.method === "GET"
      const bIsGet = b.tool.method === "GET"
      if (aIsGet !== bIsGet) {
        return aIsGet ? -1 : 1
      }
      return a.tool.name.length - b.tool.name.length
    })
    .slice(0, cappedLimit)
    .map(({ tool }) => tool)
}

/**
 * `search_tools` handler — validates the raw MCP `arguments` object and
 * returns each match's name/description/inputSchema as JSON text, the same
 * shape a `tools/list` entry has, so an agent can go straight from a match
 * to a `call_tool` invocation.
 */
export function handleSearchTools(
  args: Record<string, unknown>,
): ToolCallResult {
  const query = args.query
  if (typeof query !== "string" || query.trim().length === 0) {
    return errorResult("search_tools requires a non-empty 'query' string.")
  }
  const limit = typeof args.limit === "number" ? args.limit : undefined

  const matches = searchTools(query, limit).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))

  return jsonResult(matches)
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

  const tool = getToolByName(name)
  if (!tool) {
    return errorResult(`Unknown tool: ${name}`)
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

  return await executeTool(tool, toolArguments, apiKey)
}
