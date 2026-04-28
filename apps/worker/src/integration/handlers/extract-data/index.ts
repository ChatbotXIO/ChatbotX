import { aiTimeouts } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIModelInstance,
} from "@chatbotx.io/ai/server"
import { db } from "@chatbotx.io/database/client"
import type { AIExtractDataSchema } from "@chatbotx.io/flow-config"
import logger from "@chatbotx.io/logger"
import { contactVariableService } from "@chatbotx.io/variables"
import { generateText, Output } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { saveResultToCustomField } from "../../utils/contact"
import type { ExecuteStepProps } from "../flow"
import type { ExecuteStepResult } from "../step"

type AIExtractUserContent =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "file"; data: string; mediaType: string }

const INPUT_FILE_MEDIA_TYPE = "application/pdf"

const stringifyFieldValue = (value: unknown) => {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

const getInputValue = async (props: {
  step: AIExtractDataSchema
  conversation: ExecuteStepProps<AIExtractDataSchema>["conversation"]
}) => {
  const { step, conversation } = props

  if (step.inputType === "text") {
    let inputText = step.inputFieldId.trim()

    const variables = await contactVariableService.getAll(
      conversation.contactId,
    )

    inputText = await contactVariableService.replaceAll({
      text: inputText,
      variables,
    })

    if (step.file) {
      inputText = inputText.replace(step.file.attribute, step.file.value)
    }

    return inputText.length > 0 ? inputText : null
  }

  const inputField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
    },
    columns: {
      value: true,
    },
  })

  const inputValue = inputField?.value
  if (typeof inputValue !== "string") {
    return null
  }

  return inputValue.trim().length > 0 ? inputValue : null
}

const buildUserContent = (props: {
  inputType: AIExtractDataSchema["inputType"]
  inputValue: string
}): AIExtractUserContent[] => {
  const { inputType, inputValue } = props

  const content: AIExtractUserContent[] = []

  if (inputType === "text") {
    content.push({ type: "text", text: inputValue })
  } else if (inputType === "image") {
    content.push({ type: "image", image: inputValue })
  } else {
    content.push({
      type: "file",
      data: inputValue,
      mediaType: INPUT_FILE_MEDIA_TYPE,
    })
  }

  content.push({
    type: "text",
    text: `Please extract data from this ${inputType}`,
  })

  return content
}

export async function handleAIExtractData({
  conversation,
  step,
}: ExecuteStepProps<AIExtractDataSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    toolName: "aiExtractData",
  }

  try {
    if (step.extractFields.length === 0) {
      return {
        status: "skip",
        result: { message: "No extract fields configured" },
      }
    }

    const inputValue = await getInputValue({
      step,
      conversation,
    })

    if (!inputValue) {
      return {
        status: "skip",
        result: { message: "Input field is empty" },
      }
    }

    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      const errorMsg = `AI Config not found for provider ${step.provider}`
      logger.error(logContext, errorMsg)
      return {
        status: "error",
        errorMessage: errorMsg,
        result: null,
      }
    }

    const model = createAIModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
      traceId: conversation.id,
    })

    const schemaDescription = step.extractFields
      .map((f) => `- ${f.key}`)
      .join("\n")

    const systemPrompt = `You are a data extraction expert. Extract the following information from the provided ${step.inputType}.
Fields to extract:
${schemaDescription}`

    const userContent = buildUserContent({
      inputType: step.inputType,
      inputValue,
    })

    const dynamicSchema = z.object(
      Object.fromEntries(
        step.extractFields.map(({ key }) => [
          key,
          z.string().nullable().describe(`The value for ${key}`),
        ]),
      ),
    )

    const userMessage = {
      role: "user",
      content: userContent,
    } as const

    const { output: extractedData } = await generateText({
      model,
      system: systemPrompt,
      messages: [userMessage],
      abortSignal: controller.signal,
      output: Output.object({
        schema: dynamicSchema,
      }),
    })

    const data = dynamicSchema.parse(extractedData)
    await Promise.all(
      step.extractFields.map(async (mapping) => {
        const value = data[mapping.key]
        if (value === undefined || value === null) {
          return
        }

        await saveResultToCustomField({
          contactId: conversation.contactId,
          customFieldId: mapping.customFieldId,
          fullText: stringifyFieldValue(value),
          workspaceId: conversation.workspaceId,
        })
      }),
    )

    return {
      status: "success",
      result: data,
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(
      {
        ...logContext,
        error: parsedError.message,
        reason: "ai_generation_failed",
      },
      "Error in handleAIExtractData",
    )
    return {
      status: "error",
      errorMessage: parsedError.message,
      result: null,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
