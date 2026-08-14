import type { ChannelType } from "@chatbotx.io/database/partials"
import { notFound } from "next/navigation"
import {
  type ChannelPolicy,
  resolveChannelPolicy,
} from "@/lib/workspace/resolve-visible-channels"

/**
 * Route guard for `settings/channels/<channel>/page.tsx`: 404s when the
 * workspace does not exist or `channel` is hidden by the channel-visibility
 * policy (same semantics as `resolveVisibleChannels`, including
 * grandfathering).
 *
 * Returns the request-scoped `ChannelPolicy` so pages that also need the
 * tenant-aware owner (platform-credential resolution) reuse the reads the
 * guard already paid for instead of re-fetching the workspace and owner.
 */
export async function requireVisibleChannel(
  workspaceId: string,
  channel: ChannelType,
): Promise<ChannelPolicy> {
  const policy = await resolveChannelPolicy(workspaceId)
  if (!policy) {
    notFound()
  }
  if (!policy.visibleChannels.includes(channel)) {
    notFound()
  }
  return policy
}
