import { runChannelPostRefresh } from "@chatbotx.io/channel-registry/channel-post-refresh"
import type { LowJobRefreshChannelPost } from "@chatbotx.io/worker-config"

/**
 * Re-reads one post from its channel in the background (after a publish, a
 * live re-read, or a post a comment created). The steps are shared with the
 * refresh button: see `runChannelPostRefresh`. Never throws.
 */
export async function refreshChannelPost(
  data: LowJobRefreshChannelPost["data"],
): Promise<void> {
  await runChannelPostRefresh(data)
}
