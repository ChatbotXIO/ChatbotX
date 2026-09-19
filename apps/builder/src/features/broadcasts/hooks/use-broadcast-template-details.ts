"use client"

import type { BroadcastTemplateDetail } from "@chatbotx.io/business"
import { useEffect, useState } from "react"
import { client } from "@/lib/orpc/orpc"

export type BroadcastTemplateDetailsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; details: BroadcastTemplateDetail[] }

/**
 * Loads the per-page templates a broadcast sends while `enabled`. A failed
 * request surfaces as `error` rather than an empty list, so the caller can
 * tell "could not load" apart from "the template no longer exists".
 */
export function useBroadcastTemplateDetails(input: {
  workspaceId: string
  broadcastId: string | undefined
  enabled: boolean
}): BroadcastTemplateDetailsState {
  const { workspaceId, broadcastId, enabled } = input
  const [state, setState] = useState<BroadcastTemplateDetailsState>({
    status: "idle",
  })

  useEffect(() => {
    if (!(enabled && broadcastId)) {
      setState({ status: "idle" })
      return
    }

    let isActive = true
    setState({ status: "loading" })

    client.broadcastAPIs
      .privateListBroadcastTemplateDetailsAPI({ workspaceId, broadcastId })
      .then((details) => {
        if (isActive) {
          setState({ status: "loaded", details })
        }
      })
      .catch(() => {
        if (isActive) {
          setState({ status: "error" })
        }
      })

    return () => {
      isActive = false
    }
  }, [broadcastId, enabled, workspaceId])

  return state
}
