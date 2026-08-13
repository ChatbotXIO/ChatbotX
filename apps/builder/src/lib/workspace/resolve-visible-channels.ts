import {
  inboxService,
  tenantService,
  workspaceService,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  CREATABLE_CHANNELS,
  MANAGEABLE_CHANNELS,
} from "@chatbotx.io/database/partials"
import { cache } from "react"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

export type ChannelPolicy = {
  /** Tenant-aware owner (`resolveOwnerForWorkspace`) — the credential/policy key. */
  ownerId: string
  /** Raw tenant-policy create-allowed set (`tenantService.resolveVisibleChannels`). */
  creatable: ChannelType[]
  /** `creatable` ∪ connected (grandfathered) ∪ non-creatable-manageable (smtp). */
  visibleChannels: ChannelType[]
}

/**
 * Resolves the workspace + owner + channel-visibility policy once per
 * request. `resolveVisibleChannels` and `resolveChannelCreatable` both need a
 * subset of this data, and the settings channels layout plus every channel
 * page call one or both of them on the same request — `cache()` collapses
 * all of those into a single `workspaceService.find` +
 * `resolveOwnerForWorkspace` + `tenantService.resolveVisibleChannels` +
 * `inboxService.distinctConnectedChannels` read.
 *
 * `creatable` is kept separate from `visibleChannels` because it is not
 * recoverable from the unioned list: a channel can appear in
 * `visibleChannels` purely via grandfathering (already connected) or the
 * smtp carve-out, while still being un-creatable.
 *
 * Returns `null` when the workspace does not exist.
 */
export const resolveChannelPolicy = cache(
  async (workspaceId: string): Promise<ChannelPolicy | null> => {
    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      return null
    }

    const [ownerId, connected] = await Promise.all([
      resolveOwnerForWorkspace(workspace),
      inboxService.distinctConnectedChannels(workspaceId),
    ])
    const creatable = await tenantService.resolveVisibleChannels(ownerId)

    const visibleChannels = MANAGEABLE_CHANNELS.filter(
      (channel) =>
        !CREATABLE_CHANNELS.includes(channel) ||
        creatable.includes(channel) ||
        connected.includes(channel),
    )

    return { ownerId, creatable, visibleChannels }
  },
)

/**
 * Channels this workspace may see in the settings channels list. Shared by
 * the channels settings layout (which rows to render) and each channel page
 * (whether a directly-visited `settings/channels/<channel>` URL is allowed) so
 * the two can never disagree.
 *
 * Channel-visibility policy narrows the list to what this workspace's owner is
 * currently allowed to *create*. Grandfathering: a channel the workspace
 * already has a connected inbox for keeps its row regardless — hiding a
 * channel from creation must never make an existing connection disappear from
 * the settings UI. See AGENTS.md invariant on grandfathering and
 * `tenantService.resolveVisibleChannels`.
 *
 * Channels that are `manageable` but not `creatable` (currently only `smtp`)
 * sit outside the create-picker entirely, so channel-visibility policy — which
 * only ever narrows `CREATABLE_CHANNELS` — has no opinion on them. They must
 * always keep their settings row regardless of any hidden list, otherwise a
 * workspace with no existing inbox for that channel could never see it to
 * create its first one.
 *
 * Returns `null` when the workspace does not exist.
 */
export async function resolveVisibleChannels(
  workspaceId: string,
): Promise<ChannelType[] | null> {
  const policy = await resolveChannelPolicy(workspaceId)
  return policy?.visibleChannels ?? null
}
