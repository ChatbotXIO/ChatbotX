import { and, db, eq, inArray } from "@aha.chat/database/client"
import { TriggerAction } from "@aha.chat/database/enums"
import {
  contactCustomFieldModel,
  contactsToTagsModel,
  conversationModel,
} from "@aha.chat/database/schema"
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
import { createId } from "@paralleldrive/cuid2"
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

    const conversation = await db.query.conversationModel.findFirst({
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
        const existingTags = await db.query.tagModel.findMany({
          where: {
            id: { in: tagIds },
            chatbotId,
          },
        })

        if (existingTags.length > 0) {
          await db
            .insert(contactsToTagsModel)
            .values(
              existingTags.map((t) => ({
                contactId: conversation.contactId,
                tagId: t.id,
              })),
            )
            .onConflictDoNothing()
        }
        break
      }

      case TriggerAction.removeTag: {
        const tagIds = action.tagIds as string[]
        if (tagIds.length > 0) {
          await db
            .delete(contactsToTagsModel)
            .where(
              and(
                eq(contactsToTagsModel.contactId, conversation.contactId),
                inArray(contactsToTagsModel.tagId, tagIds),
              ),
            )
        }
        break
      }

      case TriggerAction.setCustomField: {
        const customFieldId = action.customFieldId as string
        const value = action.value as string
        const operation =
          (action.operation as (typeof FieldOperationType)[keyof typeof FieldOperationType]) ||
          FieldOperationType.set

        if (operation === FieldOperationType.set) {
          await db
            .insert(contactCustomFieldModel)
            .values({
              contactId: conversation.contactId,
              customFieldId,
              value,
              id: createId(),
            })
            .onConflictDoUpdate({
              target: [
                contactCustomFieldModel.contactId,
                contactCustomFieldModel.customFieldId,
              ],
              set: { value },
            })
        }
        break
      }

      case TriggerAction.clearCustomField: {
        const customFieldId = action.customFieldId as string
        await db
          .delete(contactCustomFieldModel)
          .where(
            and(
              eq(contactCustomFieldModel.contactId, conversation.contactId),
              eq(contactCustomFieldModel.customFieldId, customFieldId),
            ),
          )
        break
      }

      case TriggerAction.startAnotherFlow: {
        const flowId = action.flowId as string
        const flow = await db.query.flowModel.findFirst({
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
        await db
          .update(conversationModel)
          .set({ archivedAt: new Date() })
          .where(eq(conversationModel.id, conversation.id))
        break

      case TriggerAction.unarchiveConversation:
        await db
          .update(conversationModel)
          .set({ archivedAt: null })
          .where(eq(conversationModel.id, conversation.id))
        break

      case TriggerAction.assignConversation: {
        const assignedId = action.assignedId as string
        if (assignedId.startsWith("u_")) {
          const userId = assignedId.slice(2)
          const chatbotMember = await db.query.chatbotMemberModel.findFirst({
            where: {
              userId,
              chatbotId: conversation.chatbotId,
            },
          })
          if (chatbotMember) {
            await db
              .update(conversationModel)
              .set({ assignedUserId: userId })
              .where(eq(conversationModel.id, conversation.id))
          }
        } else if (assignedId.startsWith("t_")) {
          const inboxTeamId = assignedId.slice(2)
          const inboxTeam = await db.query.inboxTeamModel.findFirst({
            where: {
              id: inboxTeamId,
              chatbotId: conversation.chatbotId,
            },
          })
          if (inboxTeam) {
            await db
              .update(conversationModel)
              .set({ assignedInboxTeamId: inboxTeamId })
              .where(eq(conversationModel.id, conversation.id))
          }
        }
        break
      }

      case TriggerAction.unassignConversation:
        await db
          .update(conversationModel)
          .set({ assignedUserId: null, assignedInboxTeamId: null })
          .where(eq(conversationModel.id, conversation.id))
        break

      case TriggerAction.disableBot:
        await db
          .update(conversationModel)
          .set({ liveChatEnabled: true })
          .where(eq(conversationModel.id, conversation.id))
        break

      case TriggerAction.enableBot:
        await db
          .update(conversationModel)
          .set({ liveChatEnabled: false })
          .where(eq(conversationModel.id, conversation.id))
        break

      case TriggerAction.transferConversationToHuman:
        await db
          .update(conversationModel)
          .set({ liveChatEnabled: true })
          .where(eq(conversationModel.id, conversation.id))
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
