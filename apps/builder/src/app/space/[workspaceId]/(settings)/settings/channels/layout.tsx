import {
  inboxService,
  tenantService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  CREATABLE_CHANNELS,
  MANAGEABLE_CHANNELS,
} from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { ChannelsAccordion } from "./channels-accordion"

type SettingsChannelsLayoutProps = {
  readonly children?: ReactNode
  readonly whatsapp?: ReactNode
  readonly messenger?: ReactNode
  readonly instagram?: ReactNode
  readonly zalo?: ReactNode
  readonly telegram?: ReactNode
  readonly tiktok?: ReactNode
  readonly webchat?: ReactNode
  readonly smtp?: ReactNode
  readonly params: Promise<{ workspaceId: string }>
}

export default async function SettingsChannelsLayout(
  props: SettingsChannelsLayoutProps,
) {
  const { params, ...slots } = props
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return notFound()
  }

  // Channel-visibility policy narrows the accordion to what this workspace's
  // owner is currently allowed to *create*. Grandfathering: a channel the
  // workspace already has a connected inbox for keeps its row regardless —
  // hiding a channel from creation must never make an existing connection
  // disappear from the settings UI. See AGENTS.md invariant on grandfathering
  // and `tenantService.resolveVisibleChannels`.
  //
  // Channels that are `manageable` but not `creatable` (currently only
  // `smtp`) sit outside the create-picker entirely, so channel-visibility
  // policy — which only ever narrows `CREATABLE_CHANNELS` — has no opinion on
  // them. They must always keep their settings row regardless of any hidden
  // list, otherwise a workspace with no existing inbox for that channel could
  // never see it to create its first one.
  const [creatable, connected] = await Promise.all([
    resolveOwnerForWorkspace(workspace).then((ownerId) =>
      tenantService.resolveVisibleChannels(ownerId),
    ),
    inboxService.distinctConnectedChannels(workspaceId),
  ])
  const visibleChannels = MANAGEABLE_CHANNELS.filter(
    (channel) =>
      !CREATABLE_CHANNELS.includes(channel) ||
      creatable.includes(channel) ||
      connected.includes(channel),
  )

  return <ChannelsAccordion {...slots} visibleChannels={visibleChannels} />
}
