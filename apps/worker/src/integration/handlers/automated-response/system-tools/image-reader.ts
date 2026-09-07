import { createHash } from "node:crypto"
import type { systemFunctionNames } from "@chatbotx.io/ai"
import type {
  ImageReaderInput,
  SystemToolExecutors,
} from "@chatbotx.io/ai/server"
import type { AIAgentModelConfig } from "@chatbotx.io/database/partials"
import type { AttachmentModel } from "@chatbotx.io/database/types"
import {
  getHeavyJobCompletionWaitTimeoutMs,
  getHeavyJobOptions,
  getHeavyQueueEvents,
  HeavyJobAction,
  heavyAnalyzeImageResultSchema,
  heavyQueue,
  waitForJobCompletionWithRetries,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../../../../env"
import { getProviderName } from "../../../../lib/ai/reply-model"
import { logger } from "../../../../lib/logger"
import { resolveImageAttachment } from "./context-sources/image-source"

function getReadableImageTitle(attachment: AttachmentModel): string {
  return attachment.name?.trim() || "User uploaded image"
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32)
}

function stableJson(input: unknown): string {
  if (Array.isArray(input)) {
    return `[${input.map((value) => stableJson(value)).join(",")}]`
  }

  if (input && typeof input === "object") {
    const entries = Object.entries(input).sort(([left], [right]) =>
      left.localeCompare(right),
    )
    return `{${entries
      .map(([key, value]) => `${JSON.stringify(key)}:${stableJson(value)}`)
      .join(",")}}`
  }

  return JSON.stringify(input)
}

function buildImageReaderJobId(input: {
  attachmentId: string
  conversationId: string
  prompt: string
  providerInfo: AIAgentModelConfig
}): string {
  return `heavy-image-reader-${input.conversationId}-${input.attachmentId}-${hash(
    stableJson({
      prompt: input.prompt,
      providerInfo: input.providerInfo,
    }),
  )}`
}

function buildVisionPrompt(props: {
  attachment: AttachmentModel
  fileOnlyTrigger: boolean
  input: ImageReaderInput
}): string {
  const query = props.input.query.trim() || "Describe this image."
  const lines = [
    "Analyze the uploaded image for a customer support conversation.",
    "Answer only from visible image content. If a requested detail is not visible, say that it is not visible.",
    "Return concise natural language. Do not return JSON or markdown tables.",
    `User question: ${query}`,
  ]

  if (props.input.imageContext?.trim()) {
    lines.push(`Image selection context: ${props.input.imageContext.trim()}`)
  }

  lines.push(`Image title: ${getReadableImageTitle(props.attachment)}`)

  if (props.fileOnlyTrigger) {
    lines.push(
      "If the user did not ask a specific question, provide a short summary and suggest what detail they can ask about next.",
    )
  }

  return lines.join("\n")
}

function formatToolOutput(props: {
  analysis: string
  attachment: AttachmentModel
  fileOnlyTrigger: boolean
}) {
  const output: string[] = []
  output.push(`Image: ${getReadableImageTitle(props.attachment)}`)
  output.push(`Analysis: ${props.analysis}`)

  if (props.fileOnlyTrigger) {
    output.push(
      "Follow-up: Ask the user what specific detail in the image they want to know more about.",
    )
  }

  return output.join("\n")
}

export function createImageReaderExecutor(options: {
  abortSignal?: AbortSignal
  fileOnlyTrigger: boolean
  modelId: string
  providerInfo: AIAgentModelConfig
  triggerMessageId?: string
}): NonNullable<SystemToolExecutors[typeof systemFunctionNames.imageReader]> {
  return async (args, context) => {
    if (!context) {
      return "I can only read images when conversation context is available."
    }

    try {
      const attachment = await resolveImageAttachment({
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        messageId: options.triggerMessageId,
        query: args.query,
        sourceHint: args.imageContext,
      })

      if (!attachment) {
        return "I couldn't find a supported image in this conversation yet."
      }

      const prompt = buildVisionPrompt({
        attachment,
        fileOnlyTrigger: options.fileOnlyTrigger,
        input: args,
      })
      const job = await heavyQueue.add(
        HeavyJobAction.analyzeImage,
        {
          type: HeavyJobAction.analyzeImage,
          data: {
            workspaceId: context.workspaceId,
            originPath: attachment.originPath,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.size,
            prompt,
            providerInfo: options.providerInfo,
          },
        },
        {
          ...getHeavyJobOptions(HeavyJobAction.analyzeImage),
          jobId: buildImageReaderJobId({
            attachmentId: attachment.id,
            conversationId: context.conversationId,
            prompt,
            providerInfo: options.providerInfo,
          }),
        },
      )

      if (!(job && typeof job === "object" && "waitUntilFinished" in job)) {
        throw new Error("Heavy queue did not return a waitable image job")
      }

      const rawResult = await waitForJobCompletionWithRetries(
        job,
        heavyQueue,
        getHeavyQueueEvents(),
        getHeavyJobCompletionWaitTimeoutMs(
          HeavyJobAction.analyzeImage,
          env.HEAVY_JOB_WAIT_TIMEOUT_MS,
        ),
      )
      const result = heavyAnalyzeImageResultSchema.parse(rawResult)
      const analysis = result.analysis.trim()
      if (!analysis) {
        return "I found the image, but I couldn't extract a useful visual answer from it."
      }

      return formatToolOutput({
        attachment,
        analysis,
        fileOnlyTrigger: options.fileOnlyTrigger,
      })
    } catch (error) {
      const normalizedError = normalizeError(error)
      logger.error(
        {
          error: normalizedError,
          conversationId: context.conversationId,
          workspaceId: context.workspaceId,
          provider: getProviderName(options.providerInfo),
          modelId: options.modelId,
        },
        "[image-reader] image tool execution failed",
      )

      return "I found your image, but I couldn't analyze it completely. Please ask a more specific question or try another image."
    }
  }
}
