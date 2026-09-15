"use client"

import { useEffect } from "react"
import { heartbeatVoipPresenceAction } from "../actions/heartbeat-voip-presence.action"

/**
 * Interval between presence heartbeats. Comfortably shorter than the server's
 * presence TTL (`VOIP_PRESENCE_TTL_MS`, 45s) so a single slow/late ping never
 * flaps the agent out of the ring set.
 */
const HEARTBEAT_INTERVAL_MS = 20_000

/**
 * Keeps the current agent listed as "available for VoIP calls" while the inbox
 * is open — the routing source inbound browser-WebRTC calls ring, independent
 * of SIP `REGISTER`. Pings immediately on mount, then every
 * {@link HEARTBEAT_INTERVAL_MS}; presence lapses on its own (TTL) once the tab
 * closes or navigates away, so no explicit sign-off is required. Best-effort: a
 * failed ping is swallowed — the next tick recovers, and a missed call is not a
 * correctness failure.
 */
export function useWhatsappVoipPresence(workspaceId: string | undefined): void {
  useEffect(() => {
    if (!workspaceId) {
      return
    }

    let cancelled = false
    const ping = () => {
      heartbeatVoipPresenceAction(workspaceId).catch(() => {
        // Best-effort presence; the next interval recovers.
      })
    }

    ping()
    const interval = setInterval(() => {
      if (!cancelled) {
        ping()
      }
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [workspaceId])
}
