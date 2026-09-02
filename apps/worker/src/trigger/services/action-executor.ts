import {
  adsConversionService,
  botFieldService,
  contactCustomFieldService,
  conversationService,
  metaConversionsService,
  tagSyncService,
} from "@chatbotx.io/business"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { triggerActions } from "@chatbotx.io/database/partials"
import type { ContactInboxWorkspaceRow } from "@chatbotx.io/database/repositories"
import {
  contactsToTagsModel,
  metaCapiEventChannelSchema,
} from "@chatbotx.io/database/schema"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  errorStateDefaultFn,
  FieldOperationType,
  FieldReferenceKind,
  parseFieldReference,
  type SpreadsheetClearRowSchema,
  type SpreadsheetColumnFilterSchema,
  type SpreadsheetContactToSheetMappingSchema,
  type SpreadsheetGetRandomRowSchema,
  type SpreadsheetGetRowSchema,
  type SpreadsheetSendDataSchema,
  type SpreadsheetSheetToContactMappingSchema,
  type SpreadsheetUpdateRowSchema,
  type StepType,
  spreadsheetStepVersions,
  stepTypes,
  successStateDefaultFn,
} from "@chatbotx.io/flow-config"
import baseLogger from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import type { ExecuteStepProps } from "../../integration/handlers/flow"
import {
  clearSpreadsheetRow,
  getSpreadsheetRandomRow,
  getSpreadsheetRow,
  sendSpreadsheetData,
  updateSpreadsheetRow,
} from "../../integration/handlers/spreadsheet-handler"
import type { ActionExecutionContext } from "../types"
import { resolveActionContactInbox } from "./resolve-action-contact-inbox"

export class ActionExecutor {
  async execute(context: ActionExecutionContext): Promise<void> {
    const { action, contactId, triggerId, workspaceId } = context
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

    // Lazy + memoized: only the 3 inbox-consuming branches below need a
    // ContactInbox at all (§3.3) — resolving it eagerly for every action
    // wastes a query on the other 11 (tag/custom-field/conversation-state
    // actions), which only need `conversation`. Memoized so a switch branch
    // (currently none) can't trigger the resolve twice.
    let contactInboxPromise: Promise<ContactInboxWorkspaceRow | null> | null =
      null
    const getContactInbox = (): Promise<ContactInboxWorkspaceRow | null> => {
      contactInboxPromise ??= resolveActionContactInbox({
        contactId,
        workspaceId,
        contactInboxId: context.contactInboxId,
      })
      return contactInboxPromise
    }

    switch (actionType) {
      case triggerActions.enum.addTag: {
        const tagIds = action.tagIds as string[]
        const existingTags = await db.query.tagModel.findMany({
          where: {
            id: { in: tagIds },
            workspaceId,
            deletedAt: { isNull: true as const },
          },
        })

        if (existingTags.length > 0) {
          const newlyLinked = await db
            .insert(contactsToTagsModel)
            .values(
              existingTags.map((t) => ({
                contactId: conversation.contactId,
                tagId: t.id,
              })),
            )
            .onConflictDoNothing()
            .returning({ tagId: contactsToTagsModel.tagId })

          for (const link of newlyLinked) {
            await tagSyncService.enqueueAttach({
              workspaceId,
              contactId: conversation.contactId,
              tagId: link.tagId,
            })
            await adsConversionService.enqueueTagAppliedEvaluations({
              workspaceId,
              contactId: conversation.contactId,
              tagId: link.tagId,
            })
          }
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
          // Channel cleanup (unassign + delete ContactToTagChannel) runs in the queue.
          for (const tagId of tagIds) {
            await tagSyncService.enqueueDetach({
              workspaceId,
              contactId: conversation.contactId,
              tagId,
            })
          }
        }
        break
      }

      case triggerActions.enum.setCustomField: {
        const customFieldId = action.customFieldId as string
        const value = action.value as string
        const operation =
          (action.operation as (typeof FieldOperationType)[keyof typeof FieldOperationType]) ||
          FieldOperationType.set

        const fieldReference = parseFieldReference(customFieldId)
        switch (fieldReference.kind) {
          case FieldReferenceKind.botField:
            // Account Fields support all five operations.
            await botFieldService.applyValueOperation({
              workspaceId,
              key: fieldReference.id,
              operation,
              value,
            })
            break
          case FieldReferenceKind.customField:
            // Today's behavior, unchanged: only `set` persists; every other
            // operation stays a silent no-op (pre-existing platform bug,
            // tracked separately — see the Account Fields plan §3.2, Phase 5).
            if (operation === FieldOperationType.set) {
              await contactCustomFieldService.setValues({
                workspaceId,
                contactId: conversation.contactId,
                fields: [{ customFieldId, value }],
              })
            }
            break
          default: {
            // Exhaustiveness guard — adding a new FieldReference variant
            // without handling it here becomes a compile error.
            const _exhaustive: never = fieldReference
            baseLogger.warn(
              { fieldReference: _exhaustive },
              "Unhandled field reference kind in setCustomField",
            )
          }
        }
        break
      }

      case triggerActions.enum.clearCustomField: {
        const customFieldId = action.customFieldId as string
        const fieldReference = parseFieldReference(customFieldId)
        switch (fieldReference.kind) {
          case FieldReferenceKind.botField:
            await botFieldService.clearValueByKey({
              workspaceId,
              key: fieldReference.id,
            })
            break
          case FieldReferenceKind.customField:
            await contactCustomFieldService.deleteByCustomFieldId({
              workspaceId,
              contactIds: [conversation.contactId],
              customFieldId,
            })
            break
          default: {
            const _exhaustive: never = fieldReference
            baseLogger.warn(
              { fieldReference: _exhaustive },
              "Unhandled field reference kind in clearCustomField",
            )
          }
        }
        break
      }

      case triggerActions.enum.startAnotherFlow: {
        const contactInbox = await getContactInbox()
        if (!contactInbox) {
          baseLogger.warn(
            `No contact inbox found for contact ${contactId}, skipping startAnotherFlow action`,
          )
          break
        }

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
            conversationId: conversation,
            contactInboxId: contactInbox.id,
            flowId,
            origin: webhookChannelOrigin(),
          },
        })
        break
      }

      case triggerActions.enum.archiveConversation:
        await conversationService.updateArchived({
          workspaceId,
          conversations: [conversation],
          archivedAt: new Date(),
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "actionExecutor.archiveConversation",
            triggerType: "trigger_action",
          },
        })
        break

      case triggerActions.enum.unarchiveConversation:
        await conversationService.updateArchived({
          workspaceId,
          conversations: [conversation],
          archivedAt: null,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "actionExecutor.unarchiveConversation",
            triggerType: "trigger_action",
          },
        })
        break

      case triggerActions.enum.assignConversation: {
        const assignedId = action.assignedId as string
        let assignedUserId: string | null = null
        let assignedInboxTeamId: string | null = null

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
            assignedUserId = userId
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
            assignedInboxTeamId = inboxTeamId
          }
        }

        if (assignedUserId || assignedInboxTeamId) {
          await conversationService.updateAssignment({
            workspaceId: conversation.workspaceId,
            conversations: [conversation],
            assignedUserId,
            assignedInboxTeamId,
            triggerContext: {
              triggerSource: "worker",
              triggerHandler: "actionExecutor.assignConversation",
              triggerType: "trigger_action",
            },
          })
        }
        break
      }

      case triggerActions.enum.unassignConversation:
        await conversationService.updateAssignment({
          workspaceId: conversation.workspaceId,
          conversations: [conversation],
          assignedUserId: null,
          assignedInboxTeamId: null,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "actionExecutor.unassignConversation",
            triggerType: "trigger_action",
          },
        })
        break

      case triggerActions.enum.disableBot:
        await conversationService.disableBotState({
          workspaceId,
          conversations: [conversation],
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "actionExecutor.disableBot",
            triggerType: "trigger_action",
          },
        })
        break

      case triggerActions.enum.enableBot:
        await conversationService.enableBotState({
          workspaceId,
          conversations: [conversation],
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "actionExecutor.enableBot",
            triggerType: "trigger_action",
          },
        })
        break

      case triggerActions.enum.transferConversationToHuman:
        await conversationService.disableBotState({
          workspaceId,
          conversations: [conversation],
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "actionExecutor.transferConversationToHuman",
            triggerType: "trigger_action",
          },
        })
        if (action.notifyAdmins) {
          baseLogger.info(
            `Notifying admins for conversation ${conversation.id}`,
          )
        }
        break

      case triggerActions.enum.sendMetaCapiEvent: {
        const contactInbox = await getContactInbox()
        if (!contactInbox) {
          baseLogger.warn(
            `No contact inbox found for contact ${contactId}, skipping sendMetaCapiEvent action`,
          )
          break
        }

        const capiChannel = metaCapiEventChannelSchema.safeParse(
          contactInbox.channel,
        )
        if (!capiChannel.success) {
          baseLogger.warn(
            `Unsupported Meta CAPI trigger channel: ${contactInbox.channel}`,
          )
          break
        }

        const value =
          typeof action.value === "string" ? action.value : undefined
        const currency =
          typeof action.currency === "string" ? action.currency : undefined
        const contentCategory =
          typeof action.contentCategory === "string"
            ? action.contentCategory
            : undefined
        const contentName =
          typeof action.contentName === "string"
            ? action.contentName
            : undefined

        await metaConversionsService.enqueueLeadEvent({
          workspaceId,
          channel: capiChannel.data,
          contactInboxId: contactInbox.id,
          inboxId: contactInbox.inboxId,
          source: "triggerAction",
          sourceKey: metaConversionsService.buildLeadSourceKey({
            scope: "trigger",
            scopeId: triggerId,
            contactInboxId: contactInbox.id,
            channel: capiChannel.data,
          }),
          value,
          currency,
          contentCategory,
          contentName,
        })
        break
      }

      case triggerActions.enum.runGoogleSheet: {
        const contactInbox = await getContactInbox()
        if (!contactInbox) {
          baseLogger.warn(
            `No contact inbox found for contact ${contactId}, skipping runGoogleSheet action`,
          )
          break
        }

        const spreadsheetAction = action.action as StepType
        const spreadsheetId = action.spreadsheetId as string
        const sheetName = action.sheetName as string
        const lookup = action.lookup as SpreadsheetColumnFilterSchema
        const map = action.map ?? []

        const baseProps = {
          conversation,
          contactInbox,
        } as unknown as Omit<ExecuteStepProps<SpreadsheetGetRowSchema>, "step">

        switch (spreadsheetAction) {
          case stepTypes.enum.spreadsheetGetRow: {
            const step: SpreadsheetGetRowSchema = {
              id: createId(),
              stepType: stepTypes.enum.spreadsheetGetRow,
              spreadsheetId,
              sheetName,
              lookup,
              map: map as SpreadsheetSheetToContactMappingSchema[],
              states: [successStateDefaultFn(), errorStateDefaultFn()],
            }
            await getSpreadsheetRow({ ...baseProps, step })
            break
          }

          case stepTypes.enum.spreadsheetClearRow: {
            const step: SpreadsheetClearRowSchema = {
              id: createId(),
              stepType: stepTypes.enum.spreadsheetClearRow,
              spreadsheetId,
              sheetName,
              lookup,
              states: [successStateDefaultFn(), errorStateDefaultFn()],
            }
            await clearSpreadsheetRow({ ...baseProps, step })
            break
          }

          case stepTypes.enum.spreadsheetGetRandomRow: {
            const step: SpreadsheetGetRandomRowSchema = {
              id: createId(),
              stepType: stepTypes.enum.spreadsheetGetRandomRow,
              spreadsheetId,
              sheetName,
              lookup,
              map: map as SpreadsheetSheetToContactMappingSchema[],
              states: [successStateDefaultFn(), errorStateDefaultFn()],
            }
            await getSpreadsheetRandomRow({ ...baseProps, step })
            break
          }

          case stepTypes.enum.spreadsheetSendData: {
            const step: SpreadsheetSendDataSchema = {
              id: createId(),
              stepType: stepTypes.enum.spreadsheetSendData,
              version: spreadsheetStepVersions.enum.v2,
              spreadsheetId,
              sheetName,
              map: map as SpreadsheetContactToSheetMappingSchema[],
              states: [successStateDefaultFn(), errorStateDefaultFn()],
            }
            await sendSpreadsheetData({ ...baseProps, step })
            break
          }

          case stepTypes.enum.spreadsheetUpdateRow: {
            const step: SpreadsheetUpdateRowSchema = {
              id: createId(),
              stepType: stepTypes.enum.spreadsheetUpdateRow,
              version: spreadsheetStepVersions.enum.v2,
              spreadsheetId,
              sheetName,
              lookup,
              map: map as SpreadsheetContactToSheetMappingSchema[],
              states: [successStateDefaultFn(), errorStateDefaultFn()],
            }
            await updateSpreadsheetRow({ ...baseProps, step })
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
