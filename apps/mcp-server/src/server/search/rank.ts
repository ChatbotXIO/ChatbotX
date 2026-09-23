import type { DynamicTool } from "../../openapi-loader"
import {
  normalizeSearchText,
  STOPWORDS,
  stem,
  stripLiterals,
  tokenize,
} from "./normalize"

// Field weights: an exact name-token hit is worth far more than a hit deep
// in the long-form description body -- an agent naming the resource
// ("tags") should rank `tags_list` over an unrelated tool whose paragraph
// happens to mention tags in passing. Tags (the OpenAPI grouping, e.g.
// "Contacts") sit between summary and body: a resource-group match is a
// meaningful signal but weaker than the tool's own name/summary.
const NAME_WEIGHT = 3
const SUMMARY_WEIGHT = 2
const TAG_WEIGHT = 1.5
const BODY_WEIGHT = 0.7
// Extra credit when a query supplies at least two distinct tokens that both
// land in the tool's name -- that's the "one action + one resource" shape
// the meta-tool description asks for (e.g. "remove" + "tag" both hitting
// `contacts_remove_tags`), and it reliably separates the right tool from a
// same-resource sibling that only matches on one axis.
const MULTI_NAME_MATCH_BONUS = 2
const MULTI_NAME_MATCH_THRESHOLD = 2
const PHRASE_MATCH_BONUS = 3

type ToolTokens = {
  name: Set<string>
  summary: Set<string>
  body: Set<string>
  tags: Set<string>
  text: string
}

// Keyed by the `DynamicTool` object itself (not its name): `openapi-loader`
// hands out a fresh array of tool objects on every spec refresh, so a stale
// entry is naturally unreachable and garbage-collected -- no manual
// invalidation needed when the spec changes.
const toolTokensCache = new WeakMap<DynamicTool, ToolTokens>()
// Corpus-wide document frequency, invalidated whenever the tool list
// identity changes (a new spec fetch produces a new array).
let idfCorpus: DynamicTool[] | null = null
let documentFrequency = new Map<string, number>()

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text).map(stem))
}

/**
 * `buildToolDescription` joins the summary, description, and optional
 * requirements with blank lines. Only the first boundary separates the
 * weighted summary; remaining sections stay in the body.
 */
function splitDescription(description: string): {
  summary: string
  body: string
} {
  const separatorIndex = description.indexOf("\n\n")
  if (separatorIndex === -1) {
    return { summary: description, body: "" }
  }
  return {
    summary: description.slice(0, separatorIndex),
    body: description.slice(separatorIndex + 2),
  }
}

function getToolTokens(tool: DynamicTool): ToolTokens {
  const cached = toolTokensCache.get(tool)
  if (cached) {
    return cached
  }
  const { summary, body } = splitDescription(tool.description)
  const tokens: ToolTokens = {
    name: tokenSet(tool.name),
    summary: tokenSet(summary),
    body: tokenSet(body),
    tags: new Set(tool.tags.flatMap((tag) => [...tokenSet(tag)])),
    text: normalizeSearchText(`${tool.name} ${tool.description}`),
  }
  toolTokensCache.set(tool, tokens)
  return tokens
}

function rebuildDocumentFrequencyIfStale(tools: DynamicTool[]): void {
  if (idfCorpus === tools) {
    return
  }
  const frequency = new Map<string, number>()
  for (const tool of tools) {
    const { name, summary, body, tags } = getToolTokens(tool)
    for (const token of new Set([...name, ...summary, ...body, ...tags])) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1)
    }
  }
  documentFrequency = frequency
  idfCorpus = tools
}

/**
 * Inverse document frequency over the current tool catalog: a token every
 * tool shares (e.g. "workspace") contributes almost nothing, while a token
 * only a handful of tools use (e.g. "unsubscribe") is a strong signal.
 */
function inverseDocumentFrequency(token: string, corpusSize: number): number {
  const frequency = documentFrequency.get(token) ?? 0
  return Math.log(1 + corpusSize / (1 + frequency))
}

/**
 * Converts a raw English query into normalized catalog tokens: literals such
 * as emails, phone numbers, and ids become weak concept hints; stopwords are
 * dropped; and simple English plurals are stemmed before token matching.
 */
function queryTokens(query: string): string[] {
  return [...new Set(tokenize(stripLiterals(query)).map(stem))].filter(
    (token) => token.length > 0 && !STOPWORDS.has(token),
  )
}

function scoreTool(
  tool: DynamicTool,
  tokens: string[],
  queryPhrase: string,
  corpusSize: number,
): number {
  const { name, summary, body, tags, text } = getToolTokens(tool)

  let score = 0
  let nameMatches = 0
  for (const token of tokens) {
    const weight = inverseDocumentFrequency(token, corpusSize)
    if (name.has(token)) {
      score += NAME_WEIGHT * weight
      nameMatches++
    } else if (summary.has(token)) {
      score += SUMMARY_WEIGHT * weight
    } else if (tags.has(token)) {
      score += TAG_WEIGHT * weight
    } else if (body.has(token)) {
      score += BODY_WEIGHT * weight
    }
  }

  if (nameMatches >= MULTI_NAME_MATCH_THRESHOLD) {
    score += MULTI_NAME_MATCH_BONUS
  }

  if (queryPhrase.length > 0 && text.includes(queryPhrase)) {
    score += PHRASE_MATCH_BONUS
  }

  return score
}

/**
 * Ranks every cached tool (not just the `visibility: "default"` set --
 * that's the whole point) against the query and returns the top matches.
 * Zero-scoring tools are dropped rather than padded in at the tail: an
 * agent acting on a bad match is worse than an agent getting an empty list
 * and rephrasing.
 */
export function rankTools(
  tools: DynamicTool[],
  query: string,
  limit: number,
): DynamicTool[] {
  rebuildDocumentFrequencyIfStale(tools)
  const tokens = queryTokens(query)
  const queryPhrase = normalizeSearchText(query).trim()
  const corpusSize = tools.length

  return tools
    .map((tool) => ({
      tool,
      score: scoreTool(tool, tokens, queryPhrase, corpusSize),
    }))
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
    .slice(0, limit)
    .map(({ tool }) => tool)
}

/**
 * Distinct OpenAPI tags across the full catalog, used to hint an agent
 * toward the right resource group when a query scores zero against every
 * tool -- e.g. after a misspelling or an intent the catalog genuinely
 * doesn't cover.
 */
export function distinctResourceGroups(tools: DynamicTool[]): string[] {
  return [...new Set(tools.flatMap((tool) => tool.tags))].sort()
}
