import { aiTimeouts, type systemFunctionNames } from "@chatbotx.io/ai"
import type {
  ImageReaderInput,
  SystemToolExecutors,
} from "@chatbotx.io/ai/server"
import type { AttachmentModel } from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import { generateText, type LanguageModel } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../../lib/logger"
import { resolveImageAttachment } from "./context-sources/image-source"

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_READER_MAX_OUTPUT_TOKENS = 800

function getReadableImageTitle(attachment: AttachmentModel): string {
  return attachment.name?.trim() || "User uploaded image"
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

async function loadImageBuffer(attachment: AttachmentModel): Promise<Buffer> {
  if (attachment.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large for image reader")
  }

  const buffer = await uploader.getObject(attachment.originPath)

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large for image reader")
  }

  return buffer
}

export function createImageReaderExecutor(options: {
  abortSignal?: AbortSignal
  fileOnlyTrigger: boolean
  model: LanguageModel
  modelId: string
  provider: string
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

      const image = await loadImageBuffer(attachment)
      const prompt = buildVisionPrompt({
        attachment,
        fileOnlyTrigger: options.fileOnlyTrigger,
        input: args,
      })

      const result = await generateText({
        model: options.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image",
                image,
                mediaType: attachment.mimeType,
              },
            ],
          },
        ],
        maxOutputTokens: IMAGE_READER_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        timeout: {
          totalMs: aiTimeouts.aiStep,
          stepMs: aiTimeouts.aiStep,
        },
        abortSignal: options.abortSignal,
      })

      const analysis = result.text.trim()
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
          provider: options.provider,
          modelId: options.modelId,
        },
        "[image-reader] image tool execution failed",
      )

      return "I found your image, but I couldn't analyze it completely. Please ask a more specific question or try another image."
    }
  }
}
