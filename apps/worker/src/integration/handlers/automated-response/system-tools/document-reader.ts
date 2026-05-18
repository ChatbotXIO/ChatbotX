import type { systemFunctionNames } from "@chatbotx.io/ai"
import type {
  DocumentReaderInput,
  SystemToolExecutors,
} from "@chatbotx.io/ai/server"
import { normalizeError } from "universal-error-normalizer"
import { withTimeout } from "../../../../ai-agent/lib/async-utils"
import { extractTextFromFile } from "../../../../ai-agent/lib/text-extractor"
import { logger } from "../../../../lib/logger"
import { getContextSourceAdapter } from "./context-sources/registry"
import type { ConversationContextSnippet } from "./context-sources/types"

const FALLBACK_TEXT_TIMEOUT_MS = 15_000
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
      return {
        segment,
        score,
        index,
      }
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
    return "I found the document, but I need a more specific question to extract relevant details."
  }

  return snippets[0]?.content.slice(0, 500) ?? ""
}

function formatToolOutput(props: {
  fileOnlyTrigger: boolean
  snippets: ConversationContextSnippet[]
  summary: string
  title: null | string
}) {
  const output: string[] = []
  output.push(
    `Document: ${props.title?.trim() || "User uploaded document (PDF/DOCX)"}`,
  )
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
      "Follow-up: Ask the user what specific section or detail they want to explore next.",
    )
  }

  return output.join("\n")
}

async function parseFallbackSnippets(
  originPath: string,
  mimeType: string,
  query: string,
): Promise<ConversationContextSnippet[]> {
  const parsedText = await withTimeout(
    extractTextFromFile(originPath, mimeType),
    FALLBACK_TEXT_TIMEOUT_MS,
  )

  const normalizedText = parsedText.slice(0, FALLBACK_MAX_TEXT_CHARS)
  return pickRelevantFallbackSnippets(normalizedText, query)
}

export function createDocumentReaderExecutor(options: {
  fileOnlyTrigger: boolean
  triggerMessageId?: string
}): NonNullable<
  SystemToolExecutors[typeof systemFunctionNames.documentReader]
> {
  return async (args: DocumentReaderInput, context) => {
    if (!context) {
      return "I can only read documents when conversation context is available."
    }

    const adapter = getContextSourceAdapter("document")
    if (!adapter) {
      return "Document reader is not available right now."
    }

    try {
      const preparedContext = await adapter.prepareContext({
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        messageId: options.triggerMessageId,
        query: args.query,
        sourceHint: args.documentContext,
        topK: 5,
      })

      if (!preparedContext) {
        return "I couldn't find a supported PDF or DOCX document in this conversation yet."
      }

      let snippets = preparedContext.snippets
      if (snippets.length === 0 && preparedContext.resolvedSource.attachment) {
        snippets = await parseFallbackSnippets(
          preparedContext.resolvedSource.attachment.originPath,
          preparedContext.resolvedSource.attachment.mimeType,
          args.query,
        )
      }

      const summary = summarizeSnippets(preparedContext.summary, snippets)
      return formatToolOutput({
        title:
          preparedContext.resolvedSource.source.title ??
          preparedContext.resolvedSource.attachment?.name ??
          null,
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
        "[document-reader] document tool execution failed",
      )

      return "I found your document, but I couldn't read it completely. Please ask a more specific question or try another file."
    }
  }
}
