import type { systemFunctionNames } from "@chatbotx.io/ai"
import type {
  SystemToolExecutors,
  UrlContextInput,
} from "@chatbotx.io/ai/server"
import { htmlToText } from "html-to-text"
import { normalizeError } from "universal-error-normalizer"
import { withTimeout } from "../../../../ai-agent/lib/async-utils"
import { logger } from "../../../../lib/logger"
import { getContextSourceAdapter } from "./context-sources/registry"
import type { ConversationContextSnippet } from "./context-sources/types"
import { urlMetadataSchema } from "./context-sources/url-source"

const FALLBACK_FETCH_TIMEOUT_MS = 10_000
const FALLBACK_MAX_RESPONSE_BYTES = 500_000
const FALLBACK_MAX_TEXT_CHARS = 40_000
const FALLBACK_SNIPPET_LIMIT = 3
const PARAGRAPH_SEPARATOR_REGEX = /\n{2,}/g
const QUERY_TERM_SEPARATOR_REGEX = /\s+/
const WHITESPACE_REGEX = /\s+/g

function splitPlainTextToSnippets(text: string): string[] {
  return text
    .split(PARAGRAPH_SEPARATOR_REGEX)
    .map((segment) => segment.replace(WHITESPACE_REGEX, " ").trim())
    .filter(Boolean)
}

function pickRelevantFallbackSnippets(
  text: string,
  query: string,
): ConversationContextSnippet[] {
  const normalizedQuery = query.toLowerCase()
  const queryTerms = normalizedQuery
    .split(QUERY_TERM_SEPARATOR_REGEX)
    .map((term) => term.trim())
    .filter((term) => term.length > 2)
    .slice(0, 8)

  const segments = splitPlainTextToSnippets(text)
  if (segments.length === 0) {
    return []
  }

  if (queryTerms.length === 0) {
    return segments.slice(0, FALLBACK_SNIPPET_LIMIT).map((segment, index) => ({
      chunkIndex: index,
      content: segment.slice(0, 500),
      similarity: null,
      source: "fallback_parse",
    }))
  }

  const scoredSegments = segments
    .map((segment, index) => {
      const lowered = segment.toLowerCase()
      const score = queryTerms.reduce(
        (acc, term) => (lowered.includes(term) ? acc + 1 : acc),
        0,
      )
      return { segment, score, index }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.index - right.index
    })

  const selected = scoredSegments.slice(0, FALLBACK_SNIPPET_LIMIT)
  return selected.map((segment) => ({
    chunkIndex: segment.index,
    content: segment.segment.slice(0, 500),
    similarity: segment.score > 0 ? segment.score : null,
    source: "fallback_parse",
  }))
}

function summarizeSnippets(
  summary: null | string,
  snippets: ConversationContextSnippet[],
): string {
  if (summary?.trim()) {
    return summary.trim().slice(0, 500)
  }

  if (snippets.length === 0) {
    return "I found the URL, but I need a more specific question to extract relevant details."
  }

  return snippets[0]?.content.slice(0, 500) ?? ""
}

function formatToolOutput(props: {
  fileOnlyTrigger: boolean
  snippets: ConversationContextSnippet[]
  summary: string
  url: string
}) {
  const output: string[] = []
  output.push(`URL: ${props.url}`)
  output.push(`Summary: ${props.summary}`)

  if (props.snippets.length > 0) {
    output.push("Relevant snippets:")
    for (const [index, snippet] of props.snippets.entries()) {
      output.push(`${index + 1}. ${snippet.content}`)
    }
  } else {
    output.push("Relevant snippets: No matching snippets were found yet.")
  }

  if (props.fileOnlyTrigger) {
    output.push(
      "Follow-up: Ask the user what specific section or detail from the URL they want to explore next.",
    )
  }

  return output.join("\n")
}

async function fetchUrlText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    FALLBACK_FETCH_TIMEOUT_MS,
  )

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ChatbotX-URLContext/1.0",
        Accept: "text/html,text/plain;q=0.9",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get("content-type") ?? ""
    const isSupported =
      contentType.includes("text/html") || contentType.includes("text/plain")
    if (!isSupported) {
      throw new Error(`Unsupported content type: ${contentType}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body")
    }

    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        totalBytes += value.byteLength
        chunks.push(value)
        if (totalBytes >= FALLBACK_MAX_RESPONSE_BYTES) {
          await reader.cancel()
          break
        }
      }
    }

    const combined = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }

    const rawHtml = new TextDecoder().decode(combined)
    const text = htmlToText(rawHtml, { wordwrap: false })
    return text.slice(0, FALLBACK_MAX_TEXT_CHARS)
  } finally {
    clearTimeout(timeoutId)
  }
}

export function createUrlReaderExecutor(options: {
  fileOnlyTrigger: boolean
  triggerMessageId?: string
}): NonNullable<SystemToolExecutors[typeof systemFunctionNames.urlContext]> {
  return async (args: UrlContextInput, context) => {
    if (!context) {
      return "I can only read URLs when conversation context is available."
    }

    const adapter = getContextSourceAdapter("url")
    if (!adapter) {
      return "URL context is not available right now."
    }

    try {
      const preparedContext = await adapter.prepareContext({
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        messageId: options.triggerMessageId,
        query: args.query,
        sourceHint: args.url,
        topK: 5,
      })

      if (!preparedContext) {
        return "I couldn't find a URL in this conversation to read context from. Please share a URL and ask your question."
      }

      let snippets = preparedContext.snippets

      if (snippets.length === 0) {
        const parsedMeta = urlMetadataSchema.safeParse(
          preparedContext.resolvedSource.source.metadata,
        )
        const resolvedUrl =
          (parsedMeta.success ? parsedMeta.data.url : undefined) ??
          preparedContext.resolvedSource.source.title ??
          args.url

        if (resolvedUrl) {
          try {
            const text = await withTimeout(
              fetchUrlText(resolvedUrl),
              FALLBACK_FETCH_TIMEOUT_MS,
            )
            snippets = pickRelevantFallbackSnippets(text, args.query)
          } catch (fetchError) {
            const normalizedFetchError = normalizeError(fetchError)
            logger.warn(
              {
                error: normalizedFetchError,
                conversationId: context.conversationId,
                workspaceId: context.workspaceId,
                url: resolvedUrl,
              },
              "[url-reader] fallback URL fetch failed",
            )
          }
        }
      }

      const parsedMeta = urlMetadataSchema.safeParse(
        preparedContext.resolvedSource.source.metadata,
      )
      const displayUrl =
        (parsedMeta.success ? parsedMeta.data.url : undefined) ??
        preparedContext.resolvedSource.source.title ??
        args.url ??
        "User-provided URL"

      const summary = summarizeSnippets(preparedContext.summary, snippets)
      return formatToolOutput({
        url: displayUrl,
        snippets,
        summary,
        fileOnlyTrigger: options.fileOnlyTrigger,
      })
    } catch (error) {
      const normalizedError = normalizeError(error)
      logger.error(
        {
          error: normalizedError,
          conversationId: context.conversationId,
          workspaceId: context.workspaceId,
        },
        "[url-reader] url context tool execution failed",
      )

      return "I found the URL, but I couldn't read it completely. Please ask a more specific question or try another URL."
    }
  }
}
