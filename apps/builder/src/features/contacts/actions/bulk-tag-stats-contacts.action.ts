"use server"

import type {
  BroadcastEventType,
  CommentAutomationEventType,
  SequenceStepEventType,
} from "@chatbotx.io/analytics/schemas"
import { tagService } from "@chatbotx.io/business"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type BulkTagStatsContactsRequest,
  bulkTagStatsContactsRequest,
} from "../schema/contact-tag"

/**
 * The source-specific half of the job payload. The request and the job carry
 * the same discriminant and the same per-source fields, so this is a narrowing,
 * not a mapping — but they are declared in different packages, so the switch is
 * what keeps them provably in step: a new source that only lands in one of the
 * two unions fails to compile here.
 */
type BulkTagSource =
  | { source: "broadcast"; broadcastId: string; eventType: BroadcastEventType }
  | {
      source: "sequenceStep"
      sequenceId: string
      stepId: string
      eventType: SequenceStepEventType
    }
  | {
      source: "commentAutomation"
      automationId: string
      eventType: CommentAutomationEventType
    }

function resolveBulkTagSource(
  input: BulkTagStatsContactsRequest,
): BulkTagSource {
  switch (input.source) {
    case "broadcast":
      return {
        source: "broadcast",
        broadcastId: input.broadcastId,
        eventType: input.eventType,
      }
    case "sequenceStep":
      return {
        source: "sequenceStep",
        sequenceId: input.sequenceId,
        stepId: input.stepId,
        eventType: input.eventType,
      }
    default:
      return {
        source: "commentAutomation",
        automationId: input.automationId,
        eventType: input.eventType,
      }
  }
}

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

      await defaultQueue.add(DefaultJobAction.bulkTagContacts, {
        type: DefaultJobAction.bulkTagContacts,
        data: {
          workspaceId,
          requestedUserId: user.id,
          tagIds: tags.map((tag) => tag.id),
          excludedContactIds: parsedInput.excludedContactIds,
          ...(accessScope.restrictToAssignedUserId
            ? {
                restrictToAssignedUserId: accessScope.restrictToAssignedUserId,
              }
            : {}),
          ...resolveBulkTagSource(parsedInput),
        },
      })
    },
  )
