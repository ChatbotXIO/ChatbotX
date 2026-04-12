import { helpTexts, processStreamingText, toolPrefixes } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIModelInstance,
  getAIToolset,
  McpClient,
  normalizeMcpContent,
} from "@chatbotx.io/ai/server"
import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { streamText } from "ai"
import { saveResultToCustomField } from "../../utils/contact"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"
import { buildAIMessages } from "./messages"

export async function handleAIGenerateText({
  conversation,
  step,
}: ExecuteStepProps<AIGenerateTextSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let cleanupToolset: (() => Promise<void>) | undefined

  try {
    const messages = await buildAIMessages(conversation, step)

    const aiConfig = await aiIntegrationService.getCached({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return
    }

    const model = createAIModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
      traceId: conversation.id,
    })

    const { tools, cleanup } = await getAIToolset({
      workspaceId: conversation.workspaceId,
      tools: step.tools || [],
      toolPrefixes: {
        file: toolPrefixes.enum.file,
        fn: toolPrefixes.enum.fn,
        mcp: toolPrefixes.enum.mcp,
      },
      fileSearch: {
        fileSearchDescription: helpTexts.fileSearchDescription,
        fileSearchQueryDescription: helpTexts.fileSearchQueryDescription,
        fileSearchNoResult: helpTexts.fileSearchNoResult,
        fileSearchFoundPrefix: helpTexts.fileSearchFoundPrefix,
      },
      mcp: {
        McpClient,
        normalizeMcpContent,
      },
    })
    cleanupToolset = cleanup

    const result = streamText({
      model,
      system: step.system,
      messages,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
      maxOutputTokens: step.maxOutputTokens,
      temperature: step.temperature,
      onError: (error) => {
        throw error.error
      },
    })

    const { fullText } = await processStreamingText(
      result.textStream,
      async (_segment, parts) => {
        for (const part of parts) {
          await sendMessageWithRender(conversation.id, part)
        }
      },
      { sendParts: true },
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
      fullText,
      messageCount: 1,
      workspaceId: conversation.workspaceId,
    })
  } finally {
    clearTimeout(timeoutId)
    if (cleanupToolset) {
      await cleanupToolset()
    }
  }
}
