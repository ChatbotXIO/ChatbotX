"use client"

import type { ConnectSessionErrorCode } from "@chatbotx.io/business/inbox/connect-outcome-types"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import { type RefObject, useCallback, useMemo, useRef, useState } from "react"
import type { CoexistCallResult } from "../lib/coexist-client"
import type { ConnectTarget } from "../lib/picker-items"
import { type CoexistRowVisualState, isCoexistTarget } from "../lib/row-status"
import type { ConnectActionResultWire, ConnectOutcome } from "../schema"

/** Every in-flight request is bounded by this timeout, so the dialog always reaches a finished state (plan §2.5/2.7). */
export const CONNECT_REQUEST_TIMEOUT_MS = 60_000

/** The coexist call this row asked for, once its connect succeeded. */
export type RowCoexistState = {
  /** One of `COEXIST_ROW_STATUS`'s states — that table owns the copy and the icon. */
  status: CoexistRowVisualState
  /** Translated failure copy, shown as the row's coexist sub-line. */
  text?: string
}

export type RowState =
  | { phase: "waiting" }
  | { phase: "connecting" }
  | { phase: "cancelled" }
  /** Client-side only; the server request may still have completed — a later Retry then lands on `duplicated`/`connected` truthfully. */
  | { phase: "timedOut" }
  | { phase: "done"; outcome: ConnectOutcome; coexist?: RowCoexistState }

/** A connected outcome that actually carries the integration a coexist call targets. Referenced through `ConnectAfterConnect`. */
type ConnectedCoexistOutcome = ConnectOutcome & {
  status: "connected"
  integrationId: string
}

/** Runs coexist for one row that asked for it (`item.coexist`), right after that row connected. */
export type ConnectAfterConnect<TItem> = (
  item: TItem,
  outcome: ConnectedCoexistOutcome,
) => Promise<CoexistCallResult>

export type UseConnectBatchOptions<TItem extends ConnectTarget> = {
  items: readonly TItem[]
  /** `CONNECT_CHANNEL_REGISTRY[channel].concurrency` — `CONNECT_CONCURRENCY` for Messenger/Instagram, 1 for WhatsApp (shared-WABA setup calls). */
  concurrency: number
  /**
   * Runs one item's connect — `lib/connect-client.ts`'s `connectViaApi` for
   * every picker today. Must never reject: a transport failure is expected
   * to arrive as a typed `failed` outcome (`transportFailureOutcome`), which
   * is what makes a row retryable instead of tearing down the batch.
   */
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>
  /**
   * Invoked right after a `connected` outcome, and only for a row whose
   * picker switch asked for coexist (`item.coexist`) and whose outcome is
   * coexist-eligible. Awaited inside that row's own worker, so the row does
   * not count as settled until its coexist call finishes — rows themselves
   * still overlap, `concurrency` at a time.
   */
  afterConnect?: ConnectAfterConnect<TItem>
}

export type UseConnectBatchResult = {
  rows: ReadonlyMap<string, RowState>
  sessionError: ConnectSessionErrorCode | null
  isRunning: boolean
  total: number
  done: number
  connectedCount: number
  retryableIds: string[]
  outcomes: ConnectOutcome[]
  run: (ids?: string[]) => Promise<void>
  cancelRemaining: () => void
  retry: (ids: string[]) => Promise<void>
}

type TimeoutRace = {
  promise: Promise<{ kind: "timeout" }>
  /** Cancels the underlying timer — call once the raced request settles first, so a fast connect never leaves a dangling 60s timer behind. */
  cancel: () => void
}

function waitFor(ms: number): TimeoutRace {
  let timer: ReturnType<typeof setTimeout>
  const promise = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), ms)
  })
  return { promise, cancel: () => clearTimeout(timer) }
}

/** A row is settled once its connect AND, when it asked for one, its coexist call have finished. */
function isRowSettled(row: RowState): boolean {
  if (row.phase === "waiting" || row.phase === "connecting") {
    return false
  }
  return !(row.phase === "done" && row.coexist?.status === "running")
}

/**
 * The row a settled outcome leaves behind, before any coexist call.
 *
 * The only row that carries a `skipped` coexist sub-status is one that
 * CONNECTED while the operator had asked for the sync and the provider does
 * not offer it for that account. A row that failed or was already connected
 * elsewhere says nothing about coexist — its own badge is the whole story,
 * and "not eligible for historical sync" on top of "Failed" would be noise
 * about a sync that was never in question.
 *
 */
function settledRowState<TItem extends ConnectTarget>(
  item: TItem,
  outcome: ConnectOutcome,
): RowState {
  const skipped =
    item.coexist && outcome.status === "connected" && !outcome.coexistEligible

  return skipped
    ? { phase: "done", outcome, coexist: { status: "skipped" } }
    : { phase: "done", outcome }
}

/**
 * A row whose connect succeeded and whose coexist call failed re-runs ONLY the
 * coexist call — never a second connect for an integration that already exists.
 */
function partitionCoexistRetries(
  ids: string[],
  rows: ReadonlyMap<string, RowState>,
): Map<string, ConnectedCoexistOutcome> {
  const retries = new Map<string, ConnectedCoexistOutcome>()
  for (const id of ids) {
    const row = rows.get(id)
    if (
      row?.phase === "done" &&
      row.coexist?.status === "failed" &&
      isCoexistTarget(row.outcome)
    ) {
      retries.set(id, row.outcome)
    }
  }
  return retries
}

type BatchProgress = {
  done: number
  connectedCount: number
  retryableIds: string[]
  outcomes: ConnectOutcome[]
}

/**
 * One pass over the rows producing every derived counter the dialog renders.
 * Pure, so the hook memoizes a single identity per settle instead of four.
 */
function deriveBatchProgress<TItem extends ConnectTarget>(
  items: readonly TItem[],
  rows: ReadonlyMap<string, RowState>,
): BatchProgress {
  let done = 0
  let connectedCount = 0
  const retryableIds: string[] = []
  const outcomes: ConnectOutcome[] = []

  for (const item of items) {
    const row = rows.get(item.id)
    if (!row) {
      continue
    }
    const settled = isRowSettled(row)
    if (settled) {
      done += 1
    }
    if (row.phase === "cancelled" || row.phase === "timedOut") {
      retryableIds.push(item.id)
      continue
    }
    if (row.phase !== "done") {
      continue
    }
    outcomes.push(row.outcome)
    if (row.coexist?.status === "failed") {
      retryableIds.push(item.id)
    }
    if (row.outcome.status === "connected") {
      if (settled) {
        connectedCount += 1
      }
    } else if (row.outcome.status === "failed") {
      retryableIds.push(item.id)
    }
  }

  return { done, connectedCount, retryableIds, outcomes }
}

/** One row's connect, bounded by `CONNECT_REQUEST_TIMEOUT_MS`. */
type RacedConnect =
  | { kind: "timeout" }
  | { kind: "settled"; result: ConnectActionResultWire }

async function connectWithTimeout<TItem>(
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>,
  item: TItem,
): Promise<RacedConnect> {
  const timeout = waitFor(CONNECT_REQUEST_TIMEOUT_MS)
  const raced = await Promise.race([
    connectOne(item).then(
      (result) => ({ kind: "settled" as const, result }) as const,
    ),
    timeout.promise,
  ])
  // Call once the raced request settles first, so a fast connect never leaves
  // a dangling 60s timer behind.
  timeout.cancel()
  return raced
}

/** Everything one row's worker needs, so the worker itself stays a plain function. */
type RowWorkerDeps<TItem extends ConnectTarget> = {
  itemById: ReadonlyMap<string, TItem>
  isAborted: () => boolean
  abort: () => void
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>
  afterConnect?: ConnectAfterConnect<TItem>
  applyCoexist: (
    item: TItem,
    outcome: ConnectedCoexistOutcome,
    run: ConnectAfterConnect<TItem>,
  ) => Promise<void>
  setRow: (id: string, state: RowState) => void
  setSessionError: (code: ConnectSessionErrorCode) => void
  /** Rows whose connect already succeeded and only need their coexist call re-run. */
  coexistRetries?: ReadonlyMap<string, ConnectedCoexistOutcome>
}

/**
 * One row's whole lifecycle: cancellation check, coexist-only retry, connect
 * (timeout-bounded), session-error abort, then the settled row state.
 */
async function runRow<TItem extends ConnectTarget>(
  deps: RowWorkerDeps<TItem>,
  id: string,
): Promise<void> {
  const item = deps.itemById.get(id)
  if (!item) {
    return
  }
  if (deps.isAborted()) {
    deps.setRow(id, { phase: "cancelled" })
    return
  }

  const coexistRetry = deps.coexistRetries?.get(id)
  if (coexistRetry && deps.afterConnect) {
    await deps.applyCoexist(item, coexistRetry, deps.afterConnect)
    return
  }

  deps.setRow(id, { phase: "connecting" })

  const raced = await connectWithTimeout(deps.connectOne, item)
  if (raced.kind === "timeout") {
    deps.setRow(id, { phase: "timedOut" })
    return
  }

  const { result } = raced
  if (result.kind === "sessionError") {
    deps.setSessionError(result.code)
    deps.abort()
    deps.setRow(id, { phase: "cancelled" })
    return
  }

  const { outcome } = result
  if (deps.afterConnect && item.coexist && isCoexistTarget(outcome)) {
    await deps.applyCoexist(item, outcome, deps.afterConnect)
    return
  }
  deps.setRow(id, settledRowState(item, outcome))
}

/** The row map plus the one setter every worker writes through. */
function useRowStates<TItem extends ConnectTarget>(items: readonly TItem[]) {
  const [rows, setRows] = useState<Map<string, RowState>>(
    () => new Map(items.map((item) => [item.id, { phase: "waiting" }])),
  )
  const setRow = useCallback((id: string, state: RowState) => {
    setRows((prev) => {
      const next = new Map(prev)
      next.set(id, state)
      return next
    })
  }, [])
  return { rows, setRow }
}

/** Sets the row's coexist sub-line around one `afterConnect` call, keeping the connect outcome intact. */
function useCoexistApplier<TItem extends ConnectTarget>(
  setRow: (id: string, state: RowState) => void,
) {
  return useCallback(
    async (
      item: TItem,
      outcome: ConnectedCoexistOutcome,
      run: ConnectAfterConnect<TItem>,
    ) => {
      setRow(item.id, {
        phase: "done",
        outcome,
        coexist: { status: "running" },
      })
      const result = await run(item, outcome)
      setRow(item.id, {
        phase: "done",
        outcome,
        coexist: result.ok
          ? { status: "done" }
          : { status: "failed", text: result.text },
      })
    },
    [setRow],
  )
}

type BatchRunnerInput<TItem extends ConnectTarget> = {
  items: readonly TItem[]
  concurrency: number
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>
  afterConnect?: ConnectAfterConnect<TItem>
  rows: ReadonlyMap<string, RowState>
  setRow: (id: string, state: RowState) => void
  setSessionError: (code: ConnectSessionErrorCode | null) => void
}

/**
 * The per-row dependency bundle, assembled once per input change so `runRow`
 * itself stays a plain function outside React. `abortRef` is read through the
 * closure, so cancellation is visible to workers already in flight.
 */
function useRowWorkerDeps<TItem extends ConnectTarget>({
  items,
  connectOne,
  afterConnect,
  applyCoexist,
  setRow,
  setSessionError,
  abortRef,
}: Pick<
  BatchRunnerInput<TItem>,
  "items" | "connectOne" | "afterConnect" | "setRow" | "setSessionError"
> & {
  applyCoexist: RowWorkerDeps<TItem>["applyCoexist"]
  abortRef: RefObject<boolean>
}): Omit<RowWorkerDeps<TItem>, "coexistRetries"> {
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )

  return useMemo(
    () => ({
      itemById,
      isAborted: () => abortRef.current,
      abort: () => {
        abortRef.current = true
      },
      connectOne,
      afterConnect,
      applyCoexist,
      setRow,
      setSessionError,
    }),
    [
      abortRef,
      afterConnect,
      applyCoexist,
      connectOne,
      itemById,
      setRow,
      setSessionError,
    ],
  )
}

/**
 * Drives the batch: the re-entrancy guard, the cancellation flag, and the
 * bounded-concurrency fan-out over `runRow`.
 */
function useBatchRunner<TItem extends ConnectTarget>({
  items,
  concurrency,
  connectOne,
  afterConnect,
  rows,
  setRow,
  setSessionError,
}: BatchRunnerInput<TItem>) {
  const [isRunning, setIsRunning] = useState(false)
  // Cancellation lives entirely in the hook — a plain ref, checked at the top
  // of every worker, not a callback threaded through `connectOne`.
  const abortRef = useRef(false)
  // Synchronous re-entrancy guard: `isRunning` (state) only updates after a
  // render, so a Retry click that lands between two synchronous calls could
  // otherwise start a second `mapWithConcurrency` run — this ref is checked
  // and set immediately, in the same tick.
  const runningRef = useRef(false)
  const applyCoexist = useCoexistApplier<TItem>(setRow)
  const workerDeps = useRowWorkerDeps({
    items,
    connectOne,
    afterConnect,
    applyCoexist,
    setRow,
    setSessionError,
    abortRef,
  })

  const runIds = useCallback(
    async (
      ids: string[],
      coexistRetries?: ReadonlyMap<string, ConnectedCoexistOutcome>,
    ) => {
      // Single choke point for both `run` and `retry` — re-entrant calls
      // (e.g. a row's Retry clicked while the batch is still running) are
      // ignored rather than starting a second concurrent run.
      if (runningRef.current) {
        return
      }
      runningRef.current = true
      setIsRunning(true)
      // A fresh run always starts from a clean session-error slate: a
      // successful retry must remove the Alert and stop skipping the extra
      // steps on a now-stale code.
      setSessionError(null)
      try {
        await mapWithConcurrency(ids, concurrency, (id) =>
          runRow({ ...workerDeps, coexistRetries }, id),
        )
      } finally {
        runningRef.current = false
        setIsRunning(false)
      }
    },
    [concurrency, setSessionError, workerDeps],
  )

  /**
   * Claims the runner for a fresh pass: refuses while one is in flight, and
   * clears a previous cancellation only once it has actually claimed it.
   */
  const claimFreshRun = useCallback(() => {
    if (runningRef.current) {
      return false
    }
    abortRef.current = false
    return true
  }, [])

  const run = useCallback(
    async (ids?: string[]) => {
      if (!claimFreshRun()) {
        return
      }
      await runIds(ids ?? items.map((item) => item.id))
    },
    [claimFreshRun, items, runIds],
  )

  const cancelRemaining = useCallback(() => {
    abortRef.current = true
  }, [])

  const retry = useCallback(
    async (ids: string[]) => {
      if (!claimFreshRun()) {
        return
      }
      const coexistRetries = partitionCoexistRetries(ids, rows)
      for (const id of ids) {
        if (!coexistRetries.has(id)) {
          setRow(id, { phase: "waiting" })
        }
      }
      await runIds(ids, coexistRetries)
    },
    [claimFreshRun, rows, runIds, setRow],
  )

  return { isRunning, run, cancelRemaining, retry }
}

export function useConnectBatch<TItem extends ConnectTarget>({
  items,
  concurrency,
  connectOne,
  afterConnect,
}: UseConnectBatchOptions<TItem>): UseConnectBatchResult {
  const { rows, setRow } = useRowStates(items)
  const [sessionError, setSessionError] =
    useState<ConnectSessionErrorCode | null>(null)
  const { isRunning, run, cancelRemaining, retry } = useBatchRunner({
    items,
    concurrency,
    connectOne,
    afterConnect,
    rows,
    setRow,
    setSessionError,
  })

  // A single pass over `items`/`rows` so `done`/`connectedCount`/
  // `retryableIds`/`outcomes` share one identity per settle instead of each
  // being a fresh array on every render — callers no longer need to memoize
  // around this hook's own derived values.
  const { done, connectedCount, retryableIds, outcomes } = useMemo(
    () => deriveBatchProgress(items, rows),
    [items, rows],
  )

  return {
    rows,
    sessionError,
    isRunning,
    total: items.length,
    done,
    connectedCount,
    retryableIds,
    outcomes,
    run,
    cancelRemaining,
    retry,
  }
}
