import {
  broadcastAnalyticsService,
  commentAutomationAnalyticsService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import { tagService } from "@chatbotx.io/business"
import { chunkById } from "@chatbotx.io/database/utils"
import {
  type JobBulkTagContacts,
  loopableItemsCount,
} from "@chatbotx.io/worker-config"

type BulkTagContactsData = JobBulkTagContacts["data"]

export async function handleBulkTagContacts(
  data: BulkTagContactsData,
  options: { attemptsMade?: number } = {},
): Promise<void> {
  const fetchContactIdsPage = (cursor: string | null) => {
    const paging = {
      cursor,
      limit: loopableItemsCount,
      excludeContactIds: data.excludedContactIds,
    }
    switch (data.source) {
      case "broadcast":
        return broadcastAnalyticsService.getContactIdsPage({
          broadcastId: data.broadcastId,
          eventType: data.eventType,
          ...paging,
        })
      case "sequenceStep":
        return sequenceAnalyticsService.getContactIdsPage({
          workspaceId: data.workspaceId,
          sequenceId: data.sequenceId,
          stepId: data.stepId,
          eventType: data.eventType,
          ...paging,
        })
      default:
        return commentAutomationAnalyticsService.getContactIdsPage({
          workspaceId: data.workspaceId,
          automationId: data.automationId,
          eventType: data.eventType,
          ...paging,
        })
    }
  }

  const accessScope = data.restrictToAssignedUserId
    ? {
        restrictToAssignedUserId: data.restrictToAssignedUserId,
        canViewEmailAndPhone: true,
      }
    : undefined

  await chunkById(fetchContactIdsPage, {
    chunkSize: loopableItemsCount,
    callback: async (rows) => {
      const contactIds = [...new Set(rows.map((row) => row.contactId))]
      await tagService.bulkAttachToContacts({
        workspaceId: data.workspaceId,
        contactIds,
        tagIds: data.tagIds,
        accessScope,
        recoverUnsyncedPairs: (options.attemptsMade ?? 0) > 0,
      })
      return true
    },
  })
}
