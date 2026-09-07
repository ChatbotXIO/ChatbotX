"use client"

import type { ConnectSessionErrorCode } from "@chatbotx.io/business/inbox/connect-outcome-types"
import type { ConnectActionResultWire, ConnectOutcome } from "../schema"
import { coexistUnavailable, setCoexist } from "./coexist-client"
import type { MessageKey } from "./message-key"
import type { ConnectTarget } from "./picker-items"
import type { ConnectPickerChannel } from "./registry"
import { isCoexistTarget } from "./row-status"
import {
  toastCoexistResult,
  toastCoexistSkipped,
  toastConnectFailure,
  toastConnectWarning,
} from "./single-connect-toasts"

/**
 * How a one-item connect ended. `rejected` covers every non-connected outcome
 * (duplicated / limitReached / failed) — already toasted, and with nothing to
 * hand back to the caller's `onFinished`.
 */
export type SingleConnectResult<TResult> =
  | { kind: "sessionError"; code: ConnectSessionErrorCode }
  | { kind: "rejected" }
  | { kind: "connected"; result: TResult }

type Translate = (key: MessageKey) => string

type SingleConnectRun<TItem extends ConnectTarget, TResult> = {
  item: TItem
  channel: ConnectPickerChannel
  connectOne: (item: TItem) => Promise<TResult>
  t: Translate
  /**
   * Read at coexist time, not at call time — WhatsApp's workspace is created
   * by the connect that just ran.
   */
  resolveCoexistWorkspaceId: () => string | undefined
}

/**
 * The single-item mirror of the batch runner's `afterConnect`: the same
 * `setCoexist` call, with the outcome reported as a toast because a single
 * connect never renders `ConnectManyDialog`'s row list.
 */
async function enableCoexist({
  outcome,
  channel,
  aiReadsSyncedHistory,
  t,
  workspaceId,
}: {
  outcome: ConnectOutcome & { integrationId: string }
  channel: ConnectPickerChannel
  aiReadsSyncedHistory: boolean
  t: Translate
  workspaceId: string | undefined
}): Promise<void> {
  // Falsy (not just `undefined`) so a resolver returning "" never reaches the
  // coexist procedure, whose workspace authorization would reject it as an
  // opaque failure instead of the explicit "sync did not start".
  const result = workspaceId
    ? await setCoexist({
        workspaceId,
        channel,
        integrationId: outcome.integrationId,
        enabled: true,
        aiReadsSyncedHistory,
        t,
      })
    : coexistUnavailable(t)

  toastCoexistResult({ t, name: outcome.name, result })
}

/**
 * The picker's own per-row switch decides this — exactly as it does for every
 * row of a batch, through the same coexist route.
 */
async function runRequestedCoexist<TItem extends ConnectTarget, TResult>({
  item,
  outcome,
  channel,
  t,
  resolveCoexistWorkspaceId,
}: Omit<SingleConnectRun<TItem, TResult>, "connectOne"> & {
  outcome: ConnectOutcome
}): Promise<void> {
  if (!item.coexist) {
    return
  }
  if (!isCoexistTarget(outcome)) {
    toastCoexistSkipped(t)
    return
  }

  await enableCoexist({
    outcome,
    channel,
    aiReadsSyncedHistory: item.aiReadsSyncedHistory ?? false,
    t,
    workspaceId: resolveCoexistWorkspaceId(),
  })
}

/**
 * Runs one item's connect and reports it. A single connect never renders
 * `ConnectManyDialog`, so every outcome other than "connected" has nowhere
 * else to surface — it is toasted here and the operator stays on the picker
 * instead of silently finishing as if it had succeeded.
 */
export async function connectSingleItem<
  TItem extends ConnectTarget,
  TResult extends ConnectActionResultWire,
>({
  item,
  channel,
  connectOne,
  t,
  resolveCoexistWorkspaceId,
}: SingleConnectRun<TItem, TResult>): Promise<SingleConnectResult<TResult>> {
  const result = await connectOne(item)
  // TypeScript won't narrow `result` (typed by the generic `TResult extends
  // ConnectActionResultWire`) on its own discriminant, so this upcast is what
  // lets `wire.kind`/`wire.outcome` narrow below while `result` keeps its
  // caller-specific `TResult` shape for the payload handed to `onFinished`.
  const wire: ConnectActionResultWire = result

  if (wire.kind === "sessionError") {
    return { kind: "sessionError", code: wire.code }
  }

  const { outcome } = wire
  if (outcome.status !== "connected") {
    toastConnectFailure({ t, channel, outcome })
    return { kind: "rejected" }
  }

  // Fired before the coexist call below and before the caller finishes.
  toastConnectWarning({ t, outcome })
  await runRequestedCoexist({
    item,
    outcome,
    channel,
    t,
    resolveCoexistWorkspaceId,
  })

  return { kind: "connected", result }
}
