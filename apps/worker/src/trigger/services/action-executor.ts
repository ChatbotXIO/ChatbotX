import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { triggerActions } from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  contactsToTagsModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import {
  FieldOperationType,
  type StepType,
  stepTypes,
} from "@chatbotx.io/flow-config"
import baseLogger from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import type { ActionExecutionContext } from "../types"

export class ActionExecutor {
  async execute(context: ActionExecutionContext): Promise<void> {
    const { action, contactId, workspaceId } = context
    const actionType = action.type

    const conversation = await db.query.conversationModel.findFirst({
      where: {
        contactId,
        workspaceId,
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
      case triggerActions.enum.addTag: {
        const tagIds = action.tagIds as string[]
        const existingTags = await db.query.tagModel.findMany({
          where: {
            id: { in: tagIds },
            workspaceId,
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

      case triggerActions.enum.removeTag: {
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

      case triggerActions.enum.setCustomField: {
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

      case triggerActions.enum.clearCustomField: {
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

      case triggerActions.enum.startAnotherFlow: {
        const flowId = action.flowId as string
        const flow = await db.query.flowModel.findFirst({
          where: {
            id: flowId,
            workspaceId,
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

      case triggerActions.enum.archiveConversation:
        await db
          .update(conversationModel)
          .set({ archivedAt: new Date() })
          .where(eq(conversationModel.id, conversation.id))
        break

      case triggerActions.enum.unarchiveConversation:
        await db
          .update(conversationModel)
          .set({ archivedAt: null })
          .where(eq(conversationModel.id, conversation.id))
        break

      case triggerActions.enum.assignConversation: {
        const assignedId = action.assignedId as string
        if (assignedId.startsWith("u_")) {
          const userId = assignedId.slice(2)
          const workspaceMember = await db.query.workspaceMemberModel.findFirst(
            {
              where: {
                userId,
                workspaceId: conversation.workspaceId,
              },
            },
          )
          if (workspaceMember) {
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
              workspaceId: conversation.workspaceId,
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

      case triggerActions.enum.unassignConversation:
        await db
          .update(conversationModel)
          .set({ assignedUserId: null, assignedInboxTeamId: null })
          .where(eq(conversationModel.id, conversation.id))
        break

      case triggerActions.enum.disableBot:
        await db
          .update(conversationModel)
          .set({ botEnabled: false })
          .where(eq(conversationModel.id, conversation.id))
        conversationTrackingService
          .trackEvent({
            eventId: createId(),
            workspaceId,
            conversationId: conversation.id,
            eventType: "conversation_transferred_to_human",
            channel: "webchat", // TODO: temporary comment, use from contactInbox later
            occurredAt: new Date(),
            metadata: {
              triggerContext: {
                triggerSource: "worker",
                triggerHandler: "actionExecutor.disableBot",
                triggerType: "trigger_action",
              },
            },
          })
          .catch((error) => {
            baseLogger.error(
              error,
              "[actionExecutor.disableBot] Failed to track",
            )
          })
        break

      case triggerActions.enum.enableBot:
        await db
          .update(conversationModel)
          .set({ botEnabled: true })
          .where(eq(conversationModel.id, conversation.id))
        conversationTrackingService
          .trackEvent({
            eventId: createId(),
            workspaceId,
            conversationId: conversation.id,
            eventType: "conversation_transferred_to_bot",
            channel: "webchat", // TODO: temporary comment, use from contactInbox later
            occurredAt: new Date(),
            metadata: {
              triggerContext: {
                triggerSource: "worker",
                triggerHandler: "actionExecutor.enableBot",
                triggerType: "trigger_action",
              },
            },
          })
          .catch((error) => {
            baseLogger.error(
              error,
              "[actionExecutor.enableBot] Failed to track",
            )
          })
        break

      case triggerActions.enum.transferConversationToHuman:
        await db
          .update(conversationModel)
          .set({ botEnabled: false })
          .where(eq(conversationModel.id, conversation.id))
        if (action.notifyAdmins) {
          baseLogger.info(
            `Notifying admins for conversation ${conversation.id}`,
          )
        }
        conversationTrackingService
          .trackEvent({
            eventId: createId(),
            workspaceId,
            conversationId: conversation.id,
            eventType: "conversation_transferred_to_human",
            channel: "webchat", // TODO: temporary comment, use from contactInbox later
            occurredAt: new Date(),
            metadata: {
              triggerContext: {
                triggerSource: "worker",
                triggerHandler: "actionExecutor.transferConversationToHuman",
                triggerType: "trigger_action",
              },
            },
          })
          .catch((error) => {
            baseLogger.error(
              error,
              "[actionExecutor.transferConversationToHuman] Failed to track",
            )
          })
        break

      case triggerActions.enum.runGoogleSheet: {
        const spreadsheetAction = action.action as StepType
        // const spreadsheetId = action.spreadsheetId as string
        // const sheetName = action.sheetName as string
        // const lookup = action.lookup as SpreadsheetColumnFilterSchema
        // const map = action.map as SpreadsheetMappingSchema[]

        switch (spreadsheetAction) {
          case stepTypes.enum.spreadsheetGetRow: {
            // const step: SpreadsheetGetRowSchema = {
            //   id: "",
            //   stepType: stepTypes.enum.spreadsheetGetRow,
            //   spreadsheetId,
            //   sheetName,
            //   lookup,
            //   map,
            //   successNodeId: "",
            //   errorNodeId: "",
            // }
            // await getSpreadsheetRow({
            //   conversation,
            //   step,
            // })
            break
          }

          case stepTypes.enum.spreadsheetClearRow: {
            // const step: SpreadsheetClearRowSchema = {
            //   id: "",
            //   stepType: stepTypes.enum.spreadsheetClearRow,
            //   spreadsheetId,
            //   sheetName,
            //   lookup,
            //   successNodeId: "",
            //   errorNodeId: "",
            // }
            // await clearSpreadsheetRow({
            //   conversation,
            //   step: step as unknown as SpreadsheetGetRowSchema,
            // })
            break
          }

          case stepTypes.enum.spreadsheetGetRandomRow: {
            // const step: SpreadsheetGetRandomRowSchema = {
            //   id: "",
            //   stepType: stepTypes.enum.spreadsheetGetRandomRow,
            //   spreadsheetId,
            //   sheetName,
            //   lookup,
            //   map,
            //   successNodeId: "",
            //   errorNodeId: "",
            // }
            // await getSpreadsheetRandomRow({
            //   conversation,
            //   step: step as unknown as SpreadsheetGetRowSchema,
            // })
            break
          }

          case stepTypes.enum.spreadsheetSendData: {
            // const step: SpreadsheetSendDataSchema = {
            //   id: "",
            //   stepType: stepTypes.enum.spreadsheetSendData,
            //   spreadsheetId,
            //   sheetName,
            //   map,
            //   successNodeId: "",
            //   errorNodeId: "",
            // }
            // await sendSpreadsheetData({
            //   conversation,
            //   step: step as unknown as SpreadsheetGetRowSchema,
            // })
            break
          }

          case stepTypes.enum.spreadsheetUpdateRow: {
            // const step: SpreadsheetUpdateRowSchema = {
            //   id: "",
            //   stepType: stepTypes.enum.spreadsheetUpdateRow,
            //   spreadsheetId,
            //   sheetName,
            //   lookup,
            //   map,
            //   successNodeId: "",
            //   errorNodeId: "",
            // }
            // await updateSpreadsheetRow({
            //   conversation,
            //   step: step as unknown as SpreadsheetGetRowSchema,
            // })
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
