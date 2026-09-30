"use client"

import type {
  ThreadControlRole,
  ThreadControlState,
} from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTenantSettings } from "@/features/tenant/tenant-settings-provider"
import {
  resolveThreadControlView,
  resolveThreadOwnerLabel,
  type ThreadControlContactInbox,
  type ThreadControlView,
} from "../utils/thread-control"

export type { ThreadControlView } from "../utils/thread-control"

const MINUTE_MS = 60 * 1000

export type ThreadOwnerLabelFn = (
  state: ThreadControlState,
  role: ThreadControlRole | null,
) => string

/** Binds `resolveThreadOwnerLabel` to the current translations and brand. */
export function useThreadOwnerLabel(): ThreadOwnerLabelFn {
  const t = useTranslations()
  const { name: brand } = useTenantSettings()
  return useCallback(
    (state, role) => resolveThreadOwnerLabel(t, brand, state, role),
    [brand, t],
  )
}

/**
 * The single source of routing truth for one conversation (list row, header,
 * composer, side panel). Returns `null` — render today's UI — unless the
 * conversation has a WhatsApp inbox whose thread routing was observed. It
 * reads no context, so conversations without routing pay nothing; the owner
 * label (`useThreadOwnerLabel`) is resolved only by components that render.
 *
 * Schedules one timer for the earlier of the 24h idle boundary and the next
 * minute (the panel's relative "Since" text), only while a view exists.
 */
export function useThreadControl(
  conversation:
    | { contactInboxes: ThreadControlContactInbox[] }
    | null
    | undefined,
  composerChannel?: string | null,
): ThreadControlView | null {
  const [now, setNow] = useState(() => new Date())

  const view = useMemo(
    () => resolveThreadControlView(conversation, now, composerChannel),
    [conversation, now, composerChannel],
  )
  const idleAt = view?.idleAt ?? null
  const hasView = view !== null

  // biome-ignore lint/correctness/useExhaustiveDependencies: `now` re-arms the timer after each tick
  useEffect(() => {
    if (!hasView) {
      return
    }
    const current = Date.now()
    const nextMinute = current + MINUTE_MS - (current % MINUTE_MS)
    const next =
      idleAt && idleAt > current ? Math.min(idleAt, nextMinute) : nextMinute
    const timeout = setTimeout(() => setNow(new Date()), next - current)
    return () => clearTimeout(timeout)
  }, [hasView, idleAt, now])

  return view
}
