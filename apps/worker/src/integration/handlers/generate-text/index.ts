import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { streamText } from "ai"
import { createAIModelInstance, getAIIntegrationInDB } from "../../../lib/ai"
import { processStreamingText } from "../automated-response/text"
import type { ExecuteStepProps } from "../flow"
import { buildAIMessages } from "./messages"
import { getAIToolset } from "./tools"

export async function handleAIGenerateText({
  conversation,
  step,
}: ExecuteStepProps<AIGenerateTextSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let cleanupToolset: (() => Promise<void>) | undefined

  try {
    const messages = await buildAIMessages(conversation, step)

    const aiConfig = await getAIIntegrationInDB({
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

    const { tools, cleanup } = await getAIToolset(
      conversation.workspaceId,
      step.tools || [],
    )
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
      conversation.id,
      { sendParts: true },
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
      text: fullText,
      abortSignal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
    if (cleanupToolset) {
      await cleanupToolset()
    }
  }
}

async function saveResultToCustomField(props: {
  contactId: string
  customFieldId: string
  text: string
  abortSignal: AbortSignal
}): Promise<void> {
  const { contactId, customFieldId, text } = props

  const contact = await findOrFail({
    table: contactModel,
    where: {
      id: contactId,
    },
    message: "Contact not found",
  })

  const customField = await findOrFail({
    table: customFieldModel,
    where: {
      id: customFieldId,
      workspaceId: contact.workspaceId,
    },
    message: "Custom field not found",
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      contactId,
      customFieldId: customField.id,
      value: text,
      id: createId(),
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value: text,
      },
    })
}
