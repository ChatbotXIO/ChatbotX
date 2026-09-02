"use client"

import { type ReactNode, useState } from "react"
import { setClientCookie } from "@/lib/cookies"
import {
  BROADCASTS_PANEL_COOKIE,
  BROADCASTS_PANEL_COOKIE_MAX_AGE,
} from "../lib/broadcast-status"
import { BroadcastStatusPanel } from "./broadcast-status-panel"
import { BroadcastsToolbar } from "./broadcasts-toolbar"

export function BroadcastsListShell({
  defaultPanelOpen,
  children,
}: {
  defaultPanelOpen: boolean
  children: ReactNode
}) {
  const [panelOpen, setPanelOpen] = useState(defaultPanelOpen)

  const updatePanel = (open: boolean) => {
    setPanelOpen(open)
    setClientCookie(
      BROADCASTS_PANEL_COOKIE,
      String(open),
      BROADCASTS_PANEL_COOKIE_MAX_AGE,
    )
  }

  return (
    <div className="-m-6 flex min-h-0 flex-1">
      <BroadcastStatusPanel onOpenChange={updatePanel} open={panelOpen} />
      <section className="flex min-w-0 flex-1 flex-col">
        <BroadcastsToolbar
          onOpenPanel={() => updatePanel(true)}
          panelOpen={panelOpen}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </section>
    </div>
  )
}
