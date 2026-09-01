import { createHash } from "node:crypto"
import type { systemFunctionNames } from "@chatbotx.io/ai"
import type {
  DocumentReaderInput,
  SystemToolExecutors,
} from "@chatbotx.io/ai/server"
import {
  getHeavyQueueEvents,
  HeavyJobAction,
  heavyExtractTextFromFileResultSchema,
  heavyQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../../../../env"
import { logger } from "../../../../lib/logger"
import { getContextSourceAdapter } from "./context-sources/registry"
import type { ConversationContextSnippet } from "./context-sources/types"
import { summarizeSnippets } from "./fallback-text-utils"

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32)
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

async function parseFallbackSnippets(input: {
  attachmentId: string
  conversationId: string
  mimeType: string
  originPath: string
  query: string
  workspaceId: string
}): Promise<ConversationContextSnippet[]> {
  const job = await heavyQueue.add(
    HeavyJobAction.extractTextFromFile,
    {
      type: HeavyJobAction.extractTextFromFile,
      data: input,
    },
    {
      jobId: `heavy-document-reader-${input.conversationId}-${input.attachmentId}-${hash(input.query)}`,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  )

  if (!(job && typeof job === "object" && "waitUntilFinished" in job)) {
    throw new Error("Heavy queue did not return a waitable document job")
  }

  const rawResult = await job.waitUntilFinished(
    getHeavyQueueEvents(),
    env.HEAVY_JOB_WAIT_TIMEOUT_MS,
  )
  const result = heavyExtractTextFromFileResultSchema.parse(rawResult)

  return result.snippets.map((content, index) => ({
    chunkIndex: index,
    content,
    similarity: null,
    source: "fallback_parse",
  }))
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
        snippets = await parseFallbackSnippets({
          attachmentId: preparedContext.resolvedSource.attachment.id,
          conversationId: context.conversationId,
          mimeType: preparedContext.resolvedSource.attachment.mimeType,
          originPath: preparedContext.resolvedSource.attachment.originPath,
          query: args.query,
          workspaceId: context.workspaceId,
        })
      }

      const summary = summarizeSnippets(
        preparedContext.summary,
        snippets,
        "I found the document, but I need a more specific question to extract relevant details.",
      )
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
