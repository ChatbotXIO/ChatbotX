"use client"

import { useCallback, useState } from "react"
import type { WhatsappConnectedInfo } from "../libs/adapt-connect-result"
import {
  nextWhatsappConnectStage,
  type WhatsappConnectStage,
} from "../libs/connect-stages"
import type { WhatsappConnectOutcome } from "../schema"

export type UseWhatsappConnectStagesOptions = {
  /** The hook's single side effect — the final redirect, once every applicable stage is done. */
  onRedirect: (redirectUrl: string) => void
}

export type WhatsappConnectStagesApi = {
  stage: WhatsappConnectStage | null
  outcome: WhatsappConnectOutcome | null
  workspaceId: string | null
  /**
   * Starts the post-coexist sequence for one connected outcome. "coexist"
   * itself is not owned by this hook — it has already run (the picker's own
   * per-row switch, or `CoexistPopup` on the manual/auto-select path) before
   * `start` is ever called, or was skipped entirely, so evaluation always
   * begins looking for the next stage after "coexist".
   */
  start: (params: WhatsappConnectedInfo) => void
  /** Advances past the current stage, skipping any inapplicable ones, redirecting once none remain. */
  advance: () => void
}

/**
 * Owns the single-number inline stage sequence — coexist → verification →
 * manual result → redirect (plan §3.4) — for the path where exactly one
 * phone number is being connected (the top-level form's manual/auto-select
 * submit, or the picker's single-item fan-out), so no `ConnectManyDialog` is
 * ever rendered. The multi-select (2+) path reaches the same two stages
 * through `ConnectManyDialog`'s `extraSteps`
 * (`components/whatsapp-connect-extra-steps.tsx`), which shares this file's
 * predicates (`libs/connect-stages.ts`) but not this hook's state — table-
 * driven from the same `WHATSAPP_CONNECT_STAGE_ORDER` so the two flows can
 * never disagree on which stage a given outcome needs.
 */
export function useWhatsappConnectStages({
  onRedirect,
}: UseWhatsappConnectStagesOptions): WhatsappConnectStagesApi {
  const [stage, setStage] = useState<WhatsappConnectStage | null>(null)
  const [outcome, setOutcome] = useState<WhatsappConnectOutcome | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [redirectUrl, setRedirectUrl] = useState("")

  const start = useCallback(
    (params: WhatsappConnectedInfo) => {
      setOutcome(params.outcome)
      setWorkspaceId(params.workspaceId)
      setRedirectUrl(params.redirectUrl)

      const first = nextWhatsappConnectStage("coexist", params.outcome)
      if (!first) {
        setStage(null)
        onRedirect(params.redirectUrl)
        return
      }
      setStage(first)
    },
    [onRedirect],
  )

  const advance = useCallback(() => {
    // The next stage is computed from `stage`/`outcome` here, in the
    // callback body, not from an updater function passed to `setStage` —
    // React can invoke an updater more than once for a single state update
    // (StrictMode's dev-mode double-invocation, or a re-run under
    // concurrent rendering), which would fire `onRedirect` (the final
    // `router.push`) more than once for the exact same advance. Reading the
    // current render's closure and calling `onRedirect` outside of
    // `setStage` makes this a plain, single-fire side effect instead.
    if (!(stage && outcome)) {
      return
    }
    const next = nextWhatsappConnectStage(stage, outcome)
    setStage(next)
    if (!next) {
      onRedirect(redirectUrl)
    }
  }, [stage, outcome, redirectUrl, onRedirect])

  return { stage, outcome, workspaceId, start, advance }
}
