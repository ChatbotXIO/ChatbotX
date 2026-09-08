"use client"

import type { ConnectSessionErrorCode } from "@chatbotx.io/business/inbox/connect-outcome-types"
import { useTranslations } from "next-intl"
import { useCallback, useRef, useState } from "react"
import type { ConnectTarget } from "../lib/picker-items"
import type { ConnectPickerChannel } from "../lib/registry"
import { connectSingleItem } from "../lib/single-connect"
import type { ConnectActionResultWire } from "../schema"

/**
 * What `onFinished` is handed once a flow reaches its end: the single-item
 * path carries the `connectOne`
 * result that finished it, so a caller that stashed extra channel-specific
 * detail on that result (e.g. WhatsApp's `connected` info) can read it back
 * from the payload instead of from state it had to keep in sync itself. The
 * batch path has nothing per-item to report — every row already surfaced
 * through `ConnectManyDialog`.
 */
export type ConnectFlowFinished<TResult> =
  | { kind: "single"; result: TResult }
  | { kind: "batch" }

// Not exported — only used internally to type `UseConnectFlowResult.state` below.
type ConnectFlowState<TItem> =
  | { kind: "idle" }
  | { kind: "connectingSingle" }
  | { kind: "singleSessionError"; code: ConnectSessionErrorCode }
  | { kind: "batch"; items: TItem[] }

export type UseConnectFlowOptions<
  TItem extends ConnectTarget,
  TResult extends ConnectActionResultWire = ConnectActionResultWire,
> = {
  channel: ConnectPickerChannel
  /** Runs one item's connect — `connectViaApi` against the channel's connect route, same as the batch path. */
  connectOne: (item: TItem) => Promise<TResult>
  /** Never navigates itself — settings redirect for Messenger/Instagram, stage advance for WhatsApp, decided by the caller. */
  onFinished: (finished: ConnectFlowFinished<TResult>) => void
  /**
   * Reads the workspace the coexist route is called on for a row whose picker
   * switch asked for coexist. A function because WhatsApp's workspace is
   * created by the connect itself; every other channel just closes over the
   * id it already has. Returning `undefined` (nothing to resolve) surfaces as
   * a coexist failure — never as a silent skip, and never as a POST to an
   * empty workspace path.
   */
  resolveCoexistWorkspaceId: () => string | undefined
}

export type UseConnectFlowResult<TItem> = {
  state: ConnectFlowState<TItem>
  /** 1 item runs inline (button spinner), runs its coexist call when the row asked for one, then finishes through `onFinished`. 2+ opens the status dialog. */
  start: (items: TItem[]) => Promise<void>
  /** Called once the status dialog (`ConnectManyDialog`) reaches its Continue action. */
  finishBatch: () => void
  /** Called when the operator closes the status dialog without continuing (back to the picker). */
  closeBatch: () => void
}

export function useConnectFlow<
  TItem extends ConnectTarget,
  TResult extends ConnectActionResultWire = ConnectActionResultWire,
>({
  channel,
  connectOne,
  onFinished,
  resolveCoexistWorkspaceId,
}: UseConnectFlowOptions<TItem, TResult>): UseConnectFlowResult<TItem> {
  const [state, setState] = useState<ConnectFlowState<TItem>>({ kind: "idle" })
  const t = useTranslations()

  // `connectSingle`'s own closure only depends on `[channel, connectOne, t]`,
  // so it stays stable across renders even while `onFinished` (e.g.
  // WhatsApp's `advanceStage`) gets a new identity every time the caller's
  // own state changes. A ref refreshed every render always calls the LATEST
  // `onFinished` instead of the one captured when the callback was built.
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished
  const resolveWorkspaceIdRef = useRef(resolveCoexistWorkspaceId)
  resolveWorkspaceIdRef.current = resolveCoexistWorkspaceId

  const connectSingle = useCallback(
    async (item: TItem) => {
      setState({ kind: "connectingSingle" })

      const finished = await connectSingleItem({
        item,
        channel,
        connectOne,
        t,
        resolveCoexistWorkspaceId: () => resolveWorkspaceIdRef.current(),
      })

      if (finished.kind === "sessionError") {
        setState({ kind: "singleSessionError", code: finished.code })
        return
      }

      setState({ kind: "idle" })
      if (finished.kind === "connected") {
        onFinishedRef.current({ kind: "single", result: finished.result })
      }
    },
    [channel, connectOne, t],
  )

  const start = useCallback(
    async (items: TItem[]) => {
      if (items.length === 0) {
        return
      }
      if (items.length >= 2) {
        setState({ kind: "batch", items })
        return
      }
      await connectSingle(items[0])
    },
    [connectSingle],
  )

  const finishBatch = useCallback(() => {
    setState({ kind: "idle" })
    onFinishedRef.current({ kind: "batch" })
  }, [])

  const closeBatch = useCallback(() => {
    setState({ kind: "idle" })
  }, [])

  return { state, start, finishBatch, closeBatch }
}
