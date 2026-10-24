import {
  facebookMarketingMessageDeliveryService as service,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { facebookMarketingMessageRepository } from "@chatbotx.io/database/repositories"
import type { MarketingMessageJobData } from "@chatbotx.io/worker-config"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { getBotMessageQuotaRemaining } from "../../lib/is-bot-message-quota-reached"

type Input = MarketingMessageJobData["data"]

export async function processMarketingMessageCampaign(
  input: Input,
): Promise<void> {
  const row = await facebookMarketingMessageRepository.findById(
    input.campaignRowId,
  )
  if (!row) {
    return
  }

  // A blocked owner pauses the campaign (D20) instead of the guard's silent
  // skip, so it is never left active and re-enqueued forever.
  if (await isBlockedWorkspace(row.workspaceId)) {
    await service.pause({ id: row.id, reason: "workspaceBlocked" })
    return
  }

  await withBlockedOwnerGuard(row.workspaceId, async () => {
    switch (input.step) {
      case "prepare":
        await service.prepare(row.id)
        return
      case "startDay":
        await service.startDay(row.id)
        return
      case "dispatch": {
        if (!(await service.claimDispatchWindow(row.id))) {
          return
        }
        await service.dispatchBatch({
          campaignRowId: row.id,
          remainingQuota: () => getBotMessageQuotaRemaining(row.workspaceId),
          isWorkspaceBlocked: () => isBlockedWorkspace(row.workspaceId),
        })
        return
      }
      default:
        return
    }
  })
}
