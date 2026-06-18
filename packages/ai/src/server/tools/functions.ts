import { contactCustomFieldService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { type ToolSet, tool } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../logger"
import type { SystemFunctionContext } from "./system-functions"

type DataCollectEntry = { from: string; to: string }

function sanitizeKey(from: string): string {
  return from
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function parseDataCollect(raw: unknown): DataCollectEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter(
    (entry): entry is DataCollectEntry =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).from === "string" &&
      (entry as Record<string, unknown>).from !== "" &&
      typeof (entry as Record<string, unknown>).to === "string" &&
      (entry as Record<string, unknown>).to !== "",
  )
}

export async function getAIFunctionTools(
  workspaceId: string,
  selectedFunctionIds: string[],
  contextGetter?: () => Promise<SystemFunctionContext | null>,
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedFunctionIds.length === 0) {
      return tools
    }

    const aiFunctions = await db.query.aiFunctionModel.findMany({
      where: {
        workspaceId,
        id: {
          in: selectedFunctionIds,
        },
      },
    })

    for (const aiFunction of aiFunctions) {
      const functionName = aiFunction.name
      const functionPurpose = aiFunction.purpose || ""
      const outputMessage = aiFunction.outputMessage || ""
      const triggerFlowId = aiFunction.triggerFlowId
      const dataCollect = parseDataCollect(aiFunction.dataCollect)

      const schemaShape: Record<string, z.ZodOptional<z.ZodString>> = {}
      for (const entry of dataCollect) {
        schemaShape[sanitizeKey(entry.from)] = z
          .string()
          .optional()
          .describe(`The ${entry.from} value provided by the user`)
      }
      const inputSchema = z.looseObject(schemaShape)

      tools[functionName] = tool({
        description: functionPurpose,
        inputSchema,
        execute: async (args) => {
          if (contextGetter) {
            try {
              const context = await contextGetter()
              if (context) {
                const fieldsToSave = dataCollect.flatMap((entry) => {
                  const rawValue = (args as Record<string, unknown>)[
                    sanitizeKey(entry.from)
                  ]
                  if (
                    rawValue === undefined ||
                    rawValue === null ||
                    rawValue === ""
                  ) {
                    return []
                  }
                  return [{ customFieldId: entry.to, value: String(rawValue) }]
                })
                if (fieldsToSave.length > 0) {
                  await contactCustomFieldService.setValues({
                    workspaceId,
                    contactId: context.contactId,
                    fields: fieldsToSave,
                  })
                }

                if (triggerFlowId && context.triggerFlow) {
                  await context.triggerFlow(triggerFlowId)
                  if (context.sendMessage) {
                    await context.sendMessage(outputMessage)
                  }
                  return ""
                }

                if (outputMessage && context.sendMessage) {
                  await context.sendMessage(outputMessage)
                  return ""
                }
              }
            } catch (saveError) {
              logger.error(
                { error: normalizeError(saveError), workspaceId, functionName },
                "[ai-package] getAIFunctionTools: dataCollect save failed",
              )
            }
          }
          return outputMessage
        },
      })
    }

    return tools
  } catch (error) {
    logger.error(
      {
        error: normalizeError(error),
        workspaceId,
      },
      "[ai-package] getAIFunctionTools failed",
    )
    return {}
  }
}
