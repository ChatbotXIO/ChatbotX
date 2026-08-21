"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { useParams } from "next/navigation"
import type { ReactNode } from "react"
import { RouteAccordionShell } from "@/components/route-accordion-shell"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"

type ChannelsAccordionShellProps = {
  readonly children?: ReactNode
  /**
   * Channels to render an accordion row for. Already filtered to what the
   * workspace's platform admin / white-label owner allows to be *managed*
   * here, unioned with channels the workspace already has connected inboxes
   * for (grandfathering) — computed server-side in `layout.tsx` via
   * `resolveVisibleChannels`.
   */
  readonly visibleChannels: ChannelType[]
}

/** Channels settings list — see `RouteAccordionShell` for navigation shape. */
export function ChannelsAccordionShell({
  children,
  visibleChannels,
}: ChannelsAccordionShellProps) {
  const params = useParams<{ workspaceId: string }>()

  return (
    <RouteAccordionShell
      basePath={`/space/${params.workspaceId}/settings/channels`}
      items={visibleChannels.map((channel) => ({
        value: channel,
        label: <InboxIcon channel={channel} />,
      }))}
    >
      {children}
    </RouteAccordionShell>
  )
}
