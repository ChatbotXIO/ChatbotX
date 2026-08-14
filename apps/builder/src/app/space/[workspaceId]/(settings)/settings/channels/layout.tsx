import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { resolveVisibleChannels } from "@/lib/workspace/resolve-visible-channels"
import { ChannelsAccordionShell } from "./channels-accordion-shell"

type SettingsChannelsLayoutProps = {
  readonly children?: ReactNode
  readonly params: Promise<{ workspaceId: string }>
}

export default async function SettingsChannelsLayout(
  props: SettingsChannelsLayoutProps,
) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  // Visibility policy + grandfathering live in `resolveVisibleChannels` —
  // shared with each `settings/channels/<channel>/page.tsx` so the rendered
  // rows and the directly-addressable routes can never disagree.
  const visibleChannels = await resolveVisibleChannels(workspaceId)
  if (!visibleChannels) {
    return notFound()
  }

  return (
    <ChannelsAccordionShell visibleChannels={visibleChannels}>
      {props.children}
    </ChannelsAccordionShell>
  )
}
