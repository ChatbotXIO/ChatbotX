import { prisma } from "@aha.chat/database"
import { TriggerAction } from "@aha.chat/database/enums"
import {
  FieldOperationType,
  type SpreadsheetClearRowSchema,
  type SpreadsheetColumnFilterSchema,
  type SpreadsheetGetRandomRowSchema,
  type SpreadsheetGetRowSchema,
  type SpreadsheetMappingSchema,
  type SpreadsheetSendDataSchema,
  type SpreadsheetUpdateRowSchema,
  StepType,
} from "@aha.chat/flow-config"

import baseLogger from "@aha.chat/logger"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import {
  addContactTag,
  clearContactCustomField,
  removeContactTag,
  setContactCustomField,
} from "../../integration/handlers/contact-handler"
import {
  archiveConversation,
  assignConversation,
  disableBot,
  enableBot,
  unarchiveConversation,
  unassignConversation,
} from "../../integration/handlers/conversation-handler"
import {
  clearSpreadsheetRow,
  getSpreadsheetRandomRow,
  getSpreadsheetRow,
  sendSpreadsheetData,
  updateSpreadsheetRow,
} from "../../integration/handlers/spreadsheet-handler"
import type { ActionExecutionContext } from "../types"

export class ActionExecutor {
  async execute(context: ActionExecutionContext): Promise<void> {
    const { action, contactId, chatbotId } = context
    const actionType = action.type

    const conversation = await prisma.conversation.findFirst({
      where: {
        contactId,
        chatbotId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    if (!conversation) {
      baseLogger.warn(`No conversation found for contact ${contactId}`)
      return
    }

    switch (actionType) {
      case TriggerAction.addTag: {
        const tagIds = action.tagIds as string[]
        const tags = await prisma.tag.findMany({
          where: {
            id: { in: tagIds },
            chatbotId,
          },
          select: { name: true },
        })

        await addContactTag({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C01" as const,
            tags: tags.map((t) => t.name),
          },
        })
        break
      }

      case TriggerAction.removeTag: {
        const tagIds = action.tagIds as string[]
        const tags = await prisma.tag.findMany({
          where: {
            id: { in: tagIds },
            chatbotId,
          },
          select: { name: true },
        })
        await removeContactTag({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C01" as const,
            tags: tags.map((t) => t.name),
          },
        })
        break
      }

      case TriggerAction.setCustomField:
        await setContactCustomField({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C06" as const,
            inputCfId: action.customFieldId as string,
            operation:
              (action.operation as (typeof FieldOperationType)[keyof typeof FieldOperationType]) ||
              FieldOperationType.set,
            value: action.value as string,
          },
        })
        break

      case TriggerAction.clearCustomField:
        await clearContactCustomField({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C07" as const,
            inputCfId: action.customFieldId as string,
          },
        })
        break

      case TriggerAction.startAnotherFlow: {
        const flowId = action.flowId as string
        const flow = await prisma.flow.findFirst({
          where: {
            id: flowId,
            chatbotId,
            active: true,
          },
        })

        if (!flow?.currentVersionId) {
          baseLogger.warn(
            `Flow ${flowId} not found or not active, skipping startAnotherFlow action`,
          )
          break
        }

        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            flowId,
          },
        })
        break
      }

      case TriggerAction.archiveConversation:
        await archiveConversation({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I08" as const,
          },
        })
        break

      case TriggerAction.unarchiveConversation:
        await unarchiveConversation({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I09" as const,
          },
        })
        break

      case TriggerAction.assignConversation:
        await assignConversation({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I03" as const,
            assignedId: action.assignedId as string,
          },
        })
        break

      case TriggerAction.unassignConversation:
        await unassignConversation({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I05" as const,
          },
        })
        break

      case TriggerAction.disableBot:
        await disableBot({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I01" as const,
          },
        })
        break

      case TriggerAction.enableBot:
        await enableBot({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I02" as const,
          },
        })
        break

      case TriggerAction.transferConversationToHuman:
        await disableBot({
          conversation,
          flowId: "",
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I01" as const,
          },
        })
        if (action.notifyAdmins) {
          baseLogger.info(
            `Notifying admins for conversation ${conversation.id}`,
          )
        }
        break

      case TriggerAction.runGoogleSheet: {
        const spreadsheetAction =
          action.action as (typeof StepType)[keyof typeof StepType]
        const spreadsheetId = action.spreadsheetId as string
        const sheetName = action.sheetName as string
        const lookup = action.lookup as SpreadsheetColumnFilterSchema
        const map = action.map as SpreadsheetMappingSchema[]

        switch (spreadsheetAction) {
          case StepType.spreadsheetGetRow: {
            const step: SpreadsheetGetRowSchema = {
              id: "",
              stepType: StepType.spreadsheetGetRow,
              spreadsheetId,
              sheetName,
              lookup,
              map,
              successNodeId: "",
              errorNodeId: "",
            }
            await getSpreadsheetRow({
              conversation,
              flowId: "",
              flowVersionId: "",
              step,
            })
            break
          }

          case StepType.spreadsheetClearRow: {
            const step: SpreadsheetClearRowSchema = {
              id: "",
              stepType: StepType.spreadsheetClearRow,
              spreadsheetId,
              sheetName,
              lookup,
              successNodeId: "",
              errorNodeId: "",
            }
            await clearSpreadsheetRow({
              conversation,
              flowId: "",
              flowVersionId: "",
              step: step as unknown as SpreadsheetGetRowSchema,
            })
            break
          }

          case StepType.spreadsheetGetRandomRow: {
            const step: SpreadsheetGetRandomRowSchema = {
              id: "",
              stepType: StepType.spreadsheetGetRandomRow,
              spreadsheetId,
              sheetName,
              lookup,
              map,
              successNodeId: "",
              errorNodeId: "",
            }
            await getSpreadsheetRandomRow({
              conversation,
              flowId: "",
              flowVersionId: "",
              step: step as unknown as SpreadsheetGetRowSchema,
            })
            break
          }

          case StepType.spreadsheetSendData: {
            const step: SpreadsheetSendDataSchema = {
              id: "",
              stepType: StepType.spreadsheetSendData,
              spreadsheetId,
              sheetName,
              map,
              successNodeId: "",
              errorNodeId: "",
            }
            await sendSpreadsheetData({
              conversation,
              flowId: "",
              flowVersionId: "",
              step: step as unknown as SpreadsheetGetRowSchema,
            })
            break
          }

          case StepType.spreadsheetUpdateRow: {
            const step: SpreadsheetUpdateRowSchema = {
              id: "",
              stepType: StepType.spreadsheetUpdateRow,
              spreadsheetId,
              sheetName,
              lookup,
              map,
              successNodeId: "",
              errorNodeId: "",
            }
            await updateSpreadsheetRow({
              conversation,
              flowId: "",
              flowVersionId: "",
              step: step as unknown as SpreadsheetGetRowSchema,
            })
            break
          }

          default:
            baseLogger.warn(`Unknown spreadsheet action: ${spreadsheetAction}`)
        }
        break
      }

      default:
        baseLogger.warn(`Unknown action type: ${actionType}`)
    }
  }
}
