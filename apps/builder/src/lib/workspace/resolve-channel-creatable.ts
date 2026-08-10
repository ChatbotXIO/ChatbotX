import { tenantService, workspaceService } from "@chatbotx.io/business"
import {
  type ChannelType,
  CREATABLE_CHANNELS,
} from "@chatbotx.io/database/partials"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

/**
 * Whether `workspaceId`'s owner may still *create* `channel`, per the two-tier
 * channel-visibility policy.
 *
 * Channels outside `CREATABLE_CHANNELS` (currently only `smtp`) sit outside
 * the policy entirely and are always creatable — the same carve-out the
 * channels settings layout makes for its row filter.
 *
 * Each `@<channel>/page.tsx` slot calls this for itself: Next.js parallel
 * routes hand `layout.tsx` opaque `ReactNode` slots, so the flag cannot be
 * threaded down from the layout that computes the row-level filter. Both
 * reads are cached, so the per-slot fan-out costs nothing past the first
 * resolution.
 */
export const resolveChannelCreatable = async (
  workspaceId: string,
  channel: ChannelType,
): Promise<boolean> => {
  if (!CREATABLE_CHANNELS.includes(channel)) {
    return true
  }
  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return false
  }
  const ownerId = await resolveOwnerForWorkspace(workspace)
  const creatable = await tenantService.resolveVisibleChannels(ownerId)
  return creatable.includes(channel)
}
