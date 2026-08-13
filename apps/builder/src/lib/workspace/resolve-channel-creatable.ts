import type { ChannelType } from "@chatbotx.io/database/partials"
import { CREATABLE_CHANNELS } from "@chatbotx.io/database/partials"
import { resolveChannelPolicy } from "@/lib/workspace/resolve-visible-channels"

/**
 * Whether `workspaceId`'s owner may still *create* `channel`, per the two-tier
 * channel-visibility policy.
 *
 * Channels outside `CREATABLE_CHANNELS` (currently only `smtp`) sit outside
 * the policy entirely and are always creatable — the same carve-out the
 * channels settings layout makes for its row filter.
 *
 * Each `settings/channels/<channel>/page.tsx` route calls this for itself.
 * It reads from `resolveChannelPolicy`, which is request-scoped (`cache()`),
 * so calling this alongside `resolveVisibleChannels` on the same request
 * costs no extra workspace/tenant reads past the first resolution.
 */
export const resolveChannelCreatable = async (
  workspaceId: string,
  channel: ChannelType,
): Promise<boolean> => {
  if (!CREATABLE_CHANNELS.includes(channel)) {
    return true
  }
  const policy = await resolveChannelPolicy(workspaceId)
  return policy?.creatable.includes(channel) ?? false
}
