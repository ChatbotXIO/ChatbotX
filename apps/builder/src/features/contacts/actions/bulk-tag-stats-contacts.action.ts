"use server"

import { tagService } from "@chatbotx.io/business"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type BulkTagStatsContactsRequest,
  bulkTagStatsContactsRequest,
} from "../schemas/contact-tag"

export const bulkTagStatsContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkTagStatsContactsRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      ctx: { user: { id: string } }
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkTagStatsContactsRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      const tags = await tagService.upsertByNames({
        workspaceId,
        names: parsedInput.tags,
      })

      if (tags.length === 0) {
        return
      }

      await Promise.all([
        defaultQueue.add(DefaultJobAction.bulkTagContacts, {
          type: DefaultJobAction.bulkTagContacts,
          data: {
            workspaceId,
            requestedUserId: user.id,
            tagIds: tags.map((tag) => tag.id),
            excludedContactIds: parsedInput.excludedContactIds,
            ...(accessScope.restrictToAssignedUserId
              ? {
                  restrictToAssignedUserId:
                    accessScope.restrictToAssignedUserId,
                }
              : {}),
            ...(parsedInput.source === "broadcast"
              ? {
                  source: "broadcast",
                  broadcastId: parsedInput.broadcastId,
                  eventType: parsedInput.eventType,
                }
              : {
                  source: "sequenceStep",
                  sequenceId: parsedInput.sequenceId,
                  stepId: parsedInput.stepId,
                  eventType: parsedInput.eventType,
                }),
          },
        }),
        defaultQueue.add(DefaultJobAction.sendAuditLog, {
          type: DefaultJobAction.sendAuditLog,
          data: {
            userId: user.id,
            workspaceId,
            action: "update",
            detail: "Bulk tag contacts",
          },
        }),
      ])
    },
  )
