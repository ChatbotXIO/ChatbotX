import type {
  BroadcastEventType,
  CommentAutomationEventType,
  SequenceStepEventType,
} from "@chatbotx.io/analytics/schemas"
import { tagService } from "@chatbotx.io/business"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import type { BulkTagStatsContactsRequest } from "../schema/contact-tag"

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

/**
 * Upserts the tags by name and queues the job that tags every contact behind a
 * stats event. Shared by the builder action and the public API. Returns false
 * when there was nothing to tag with (no usable tag names).
 */
export async function enqueueBulkTagStatsContacts(input: {
  workspaceId: string
  requestedUserId: string
  request: BulkTagStatsContactsRequest
  restrictToAssignedUserId?: string
}): Promise<boolean> {
  const { workspaceId, requestedUserId, request, restrictToAssignedUserId } =
    input
  const tags = await tagService.upsertByNames({
    workspaceId,
    names: request.tags,
  })
  if (tags.length === 0) {
    return false
  }

  await defaultQueue.add(DefaultJobAction.bulkTagContacts, {
    type: DefaultJobAction.bulkTagContacts,
    data: {
      workspaceId,
      requestedUserId,
      tagIds: tags.map((tag) => tag.id),
      excludedContactIds: request.excludedContactIds,
      ...(restrictToAssignedUserId ? { restrictToAssignedUserId } : {}),
      ...resolveBulkTagSource(request),
    },
  })
  return true
}
