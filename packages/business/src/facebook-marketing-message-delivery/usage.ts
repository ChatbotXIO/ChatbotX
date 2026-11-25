import { messageUsageService } from "../message-usage/service"

/**
 * Counts Marketing Message sends as bot messages through
 * `messageUsageService.charge`: the same owner pool (lifetime and monthly),
 * workspace display counter and per-period ledger (`workspaceBotMessageUsageService`)
 * as the worker's chat sends. The counters run sequentially inside `charge`.
 */
export async function recordMarketingMessageUsage(input: {
  workspaceId: string
  count: number
}): Promise<void> {
  await messageUsageService.charge(input)
}
