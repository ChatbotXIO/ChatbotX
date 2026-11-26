import type { DatabaseClient } from "@chatbotx.io/database/client"
import { isLockTimeoutError } from "@chatbotx.io/database/client"
import { acquirePipelineAdvisoryLock } from "@chatbotx.io/database/repositories"
import {
  resetLocalLockTimeout,
  setLocalLockTimeout,
} from "@chatbotx.io/database/statement-timeout"
import { conflictException } from "../errors"
import type { PipelineAccessScope } from "./access"

/**
 * How long one stage-order lock wait may last before the caller gets a 409.
 * Bounds only these waits (the rest of the transaction keeps its own limits).
 */
const STAGE_ORDER_LOCK_TIMEOUT = "10s"

/**
 * Serialises everything that reads or writes a stage's manual order or its
 * membership (create, stage change, placement, transfer, drain, field-key
 * strip). Transaction-scoped; see "Locking order" in docs/pipelines.md.
 */
export const stageOrderLockKey = (workspaceId: string, stageId: string) =>
  `pipeline-stage-order:${workspaceId}:${stageId}`

/**
 * `bounded` (request paths) gives up after `STAGE_ORDER_LOCK_TIMEOUT` with a
 * 409; `unbounded` (background and maintenance work that cannot be retried by
 * a caller: the field-key strip after the field is already deleted, the queued
 * stage drain job) waits as long as it takes.
 */
export const stageOrderWaits = ["bounded", "unbounded"] as const
export type StageOrderWait = (typeof stageOrderWaits)[number]

/**
 * The wait a caller's scope gets: the workspace's own automation (flow steps,
 * trigger actions: `system`) has nobody to retry a 409, so it waits; every
 * request path (member, workspace token, support) is bounded.
 */
export const stageOrderWaitFor = (
  scope: PipelineAccessScope,
): StageOrderWait => (scope.kind === "system" ? "unbounded" : "bounded")

/**
 * Takes the stage-order locks of every given stage in one sorted pass. Callers
 * pass all the stages they will touch in a single call: two writers that need
 * the same pair then always queue in the same order and cannot deadlock.
 */
export async function lockStageOrder(
  tx: DatabaseClient,
  workspaceId: string,
  stageIds: readonly string[],
  wait: StageOrderWait = "bounded",
): Promise<void> {
  const keys = [...new Set(stageIds)]
    .map((stageId) => stageOrderLockKey(workspaceId, stageId))
    .sort()
  if (keys.length === 0) {
    return
  }
  if (wait === "unbounded") {
    for (const key of keys) {
      await acquirePipelineAdvisoryLock(tx, key)
    }
    return
  }
  await setLocalLockTimeout(tx, STAGE_ORDER_LOCK_TIMEOUT)
  try {
    for (const key of keys) {
      await acquirePipelineAdvisoryLock(tx, key)
    }
  } catch (error) {
    if (isLockTimeoutError(error)) {
      throw conflictException("The stage is busy. Try again.", "conflict")
    }
    throw error
  }
  await resetLocalLockTimeout(tx)
}

/**
 * Thrown inside a transaction that locked the wrong stages: the item (or the
 * strip candidates) changed stage between the unlocked read that chose the
 * keys and the row lock. The keys held are stale and taking the right ones now
 * could break the sorted order, so the whole transaction is restarted.
 */
export class StageOrderRetry extends Error {
  constructor() {
    super("The stage changed before the stage-order locks were held")
    this.name = "StageOrderRetry"
  }
}

/**
 * Runs a whole transaction, restarting it once on `StageOrderRetry` (a fresh
 * transaction, so nothing of the aborted attempt survives). A second mismatch
 * means the item keeps moving: a 409 the caller can retry.
 */
export async function withStageOrderRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof StageOrderRetry)) {
      throw error
    }
  }
  try {
    return await run()
  } catch (error) {
    if (error instanceof StageOrderRetry) {
      throw conflictException(
        "The item changed stage while it was being placed. Try again.",
        "conflict",
      )
    }
    throw error
  }
}
