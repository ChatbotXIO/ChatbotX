import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { PIPELINE_LIMITS } from "@chatbotx.io/database/partials"
import {
  acquirePipelineAdvisoryLock,
  pipelineActivityRepository,
  pipelineItemRepository,
  pipelineReferenceRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import type {
  PipelineModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { logger } from "../logger"
import {
  type PipelineAccessScope,
  type PipelineAction,
  permitsPipelineAction,
} from "./access"
import {
  activityRowFor,
  dispatchPipelineEffects,
  effectsFromDiff,
  type PipelineEffect,
  realtimeEffect,
} from "./mutation-engine"
import { pipelineService } from "./service"
import type { PipelineActor } from "./types"

export type StageRemovalMode =
  | { kind: "delete" }
  | { kind: "move"; toStageId: string }

type DeleteStageResult = { queued: false } | { queued: true; jobId: string }

/** One id per attempt, so a failed job that is kept for inspection never blocks a retry. */
export const pipelineStageBulkJobId = (stageId: string, now = Date.now()) =>
  `pipeline-stage-bulk-${stageId}-${now}`

/**
 * A claim is committed before its job is enqueued, so for a moment a live
 * claim has no job in Redis. Within this window a claim without a job is
 * still owned by the request that is enqueueing it; after it, the claim is
 * abandoned (the process died before enqueueing) and may be taken over.
 */
export const STAGE_CLAIM_ENQUEUE_GRACE_MS = 60_000

const CLAIM_TIME_PATTERN = /-(\d+)$/

/** When a claim was made, read back from its job id (null for an unknown format). */
export const stageClaimCreatedAt = (bulkJobId: string): number | null => {
  const match = CLAIM_TIME_PATTERN.exec(bulkJobId)
  return match ? Number(match[1]) : null
}

/** Consecutive empty batches tolerated while rows remain in the stage. */
const MAX_EMPTY_DRAIN_ROUNDS = 5

type ResolvedRemoval =
  | { kind: "delete" }
  | { kind: "move"; target: PipelineStageModel }

type BatchOutcome =
  | { kind: "lost" }
  | { kind: "aborted" }
  | { kind: "drained"; handled: number }

/** The item permission removing a non-empty stage needs, per mode. */
const ITEM_ACTION = {
  delete: "delete",
  move: "edit",
} as const satisfies Record<StageRemovalMode["kind"], PipelineAction>

const removalMode = (toStageId?: string | null): StageRemovalMode =>
  toStageId ? { kind: "move", toStageId } : { kind: "delete" }

/**
 * Deleting a stage with its items, or moving them first. Up to
 * `bulkSyncItems` it runs inline in one transaction; above that it is handed
 * to the default worker, which settles it in `bulkBatchSize` batches so no
 * single transaction or request holds thousands of rows.
 */
export class PipelineStageBulkService extends BaseService {
  async deleteStage(input: {
    workspaceId: string
    pipelineId: string
    stageId: string
    moveItemsToStageId?: string
    scope: PipelineAccessScope
    actor: PipelineActor
  }): Promise<DeleteStageResult> {
    const { workspaceId, pipelineId, stageId } = input
    const { pipeline, permissions } =
      await pipelineService.requireAccessWithPermissions({
        workspaceId,
        pipelineId,
        scope: input.scope,
        action: "manageSettings",
      })
    const mode = removalMode(input.moveItemsToStageId)

    const prepared = await db.transaction(async (tx) => {
      await acquirePipelineAdvisoryLock(
        tx,
        pipelineService.structureLockKey(workspaceId, pipelineId),
      )
      const stages = await pipelineStageRepository.listByPipeline(
        { workspaceId, pipelineId },
        tx,
      )
      const { stage, removal } = this.requireRemovable(stages, stageId, mode)
      // A busy stage is only reclaimable when its job is gone (failed for
      // good, or never enqueued and past the enqueue grace window); a live job,
      // or a claim whose request may still be enqueueing, keeps owning it.
      if (stage.bulkJobId && (await this.isClaimHeld(stage.bulkJobId))) {
        throw conflictException(
          "This stage is already being processed",
          "stageBusy",
        )
      }
      // Exclusive lock: a writer holding the shared lock finishes first, so the
      // drain below sees its item; later writers find the stage gone.
      await pipelineStageRepository.lockExclusive(
        { workspaceId, id: stageId },
        tx,
      )
      const count = await pipelineItemRepository.countByStage(
        { workspaceId, pipelineId, stageId },
        tx,
      )
      // Removing the stage is a settings change, but what happens to its
      // items is an item change: deleting them needs delete, moving them
      // needs edit, exactly as doing it item by item would.
      if (
        count > 0 &&
        !permitsPipelineAction(permissions, ITEM_ACTION[mode.kind])
      ) {
        throw new ChatbotXException(
          "You do not have permission to do this on this pipeline",
          "forbidden",
          403,
        )
      }
      if (count > PIPELINE_LIMITS.bulkSyncItems) {
        const jobId = pipelineStageBulkJobId(stageId)
        await pipelineStageRepository.update(
          {
            workspaceId,
            pipelineId,
            id: stageId,
            values: { bulkJobId: jobId },
          },
          tx,
        )
        return { kind: "queued" as const, jobId }
      }
      const effects: PipelineEffect[] = []
      await this.drain({
        tx,
        pipeline,
        stage,
        stages,
        removal,
        actor: input.actor,
        effects,
        batchLimit: PIPELINE_LIMITS.bulkSyncItems,
      })
      await this.removeStageRow({ tx, workspaceId, pipelineId, stageId })
      return { kind: "done" as const, effects }
    })

    if (prepared.kind === "queued") {
      try {
        await defaultQueue.add(
          DefaultJobAction.processPipelineStageBulk,
          {
            type: DefaultJobAction.processPipelineStageBulk,
            data: {
              workspaceId,
              pipelineId,
              stageId,
              bulkJobId: prepared.jobId,
              moveItemsToStageId: input.moveItemsToStageId ?? null,
              actorUserId: input.actor.userId,
              actorKind: input.actor.kind,
              actorSourceId: input.actor.sourceId,
            },
          },
          { jobId: prepared.jobId },
        )
      } catch (error) {
        // Nothing will ever clear the claim, so give the stage back, but never a
        // newer claim another request made meanwhile.
        await this.releaseClaim({
          workspaceId,
          pipelineId,
          stageId,
          bulkJobId: prepared.jobId,
        })
        throw error
      }
      await this.audit(
        "delete",
        `queued deletion of stage ${stageId} of pipeline ${pipelineId}`,
      )
      return { queued: true, jobId: prepared.jobId }
    }

    await this.finish(workspaceId, pipelineId, prepared.effects)
    await this.audit(
      "delete",
      `deleted stage ${stageId} of pipeline ${pipelineId}`,
    )
    return { queued: false }
  }

  /**
   * Worker entry. Idempotent and resumable: every pass only sees what is still
   * in the stage, so a retried job continues where the last one stopped.
   */
  async processQueued(input: {
    workspaceId: string
    pipelineId: string
    stageId: string
    bulkJobId: string
    moveItemsToStageId: string | null
    actorUserId: string | null
    actorKind: PipelineActor["kind"]
    actorSourceId: string | null
  }): Promise<void> {
    const { workspaceId, pipelineId, stageId, bulkJobId } = input
    // The actor that queued the removal, so activity and webhooks attribute the
    // batches to it (a workspace token stays a token, not a user).
    const actor: PipelineActor = {
      kind: input.actorKind,
      userId: input.actorUserId,
      sourceId: input.actorSourceId,
    }
    const mode = removalMode(input.moveItemsToStageId)

    for (;;) {
      const effects: PipelineEffect[] = []
      const batch = await db.transaction(async (tx): Promise<BatchOutcome> => {
        // Serialise with structure edits for this batch only; the lock is not
        // held across batches so other edits are not starved.
        await acquirePipelineAdvisoryLock(
          tx,
          pipelineService.structureLockKey(workspaceId, pipelineId),
        )
        const stages = await pipelineStageRepository.listByPipeline(
          { workspaceId, pipelineId },
          tx,
        )
        const stage = stages.find((candidate) => candidate.id === stageId)
        if (!stage) {
          return { kind: "drained", handled: 0 }
        }
        // Another request reclaimed the stage (or it was released): this job
        // no longer owns it and must not mutate anything.
        if (stage.bulkJobId !== bulkJobId) {
          return { kind: "lost" }
        }
        const removal = this.resolveRemoval(stages, mode)
        if (!removal) {
          // The destination vanished: stop instead of deleting what was meant
          // to be moved, and give the stage back.
          await pipelineStageRepository.update(
            {
              workspaceId,
              pipelineId,
              id: stageId,
              values: { bulkJobId: null },
            },
            tx,
          )
          return { kind: "aborted" }
        }
        const pipeline = await pipelineService.requireAccess({
          workspaceId,
          pipelineId,
          scope: { kind: "support" },
          action: "view",
          tx,
        })
        // The user who queued the removal may have deleted their account since:
        // their activity rows then carry no user instead of failing every batch.
        const actorExists =
          actor.userId === null ||
          (await pipelineReferenceRepository.lockUserIfExists(actor.userId, tx))
        const handled = await this.drain({
          tx,
          pipeline,
          stage,
          stages,
          removal,
          actor: actorExists ? actor : { ...actor, userId: null },
          effects,
          batchLimit: PIPELINE_LIMITS.bulkBatchSize,
          singleBatch: true,
        })
        return { kind: "drained", handled }
      })
      if (batch.kind === "lost") {
        logger.warn(
          { workspaceId, pipelineId, stageId, bulkJobId },
          "Pipeline stage job no longer owns the stage; stopping",
        )
        return
      }
      await dispatchPipelineEffects(effects)
      await dispatchPipelineEffects([
        realtimeEffect({ workspaceId, pipelineId }, "bulk"),
      ])
      if (batch.kind === "aborted") {
        logger.warn(
          { workspaceId, pipelineId, stageId },
          "Pipeline stage move aborted: destination stage no longer exists",
        )
        return
      }
      if (batch.handled === 0) {
        break
      }
    }

    const removed = await db.transaction(async (tx) => {
      await acquirePipelineAdvisoryLock(
        tx,
        pipelineService.structureLockKey(workspaceId, pipelineId),
      )
      const stages = await pipelineStageRepository.listByPipeline(
        { workspaceId, pipelineId },
        tx,
      )
      const owned = stages.find((candidate) => candidate.id === stageId)
      if (owned?.bulkJobId !== bulkJobId) {
        return false
      }
      await this.removeStageRow({ tx, workspaceId, pipelineId, stageId })
      return true
    })
    if (!removed) {
      return
    }
    await this.finish(workspaceId, pipelineId, [])
    await this.audit(
      "delete",
      `deleted stage ${stageId} of pipeline ${pipelineId}`,
    )
  }

  /**
   * Gives the stage back when the job cannot run (blocked owner). Only the
   * claim this job holds is cleared, never a newer one.
   */
  async releaseClaim(input: {
    workspaceId: string
    pipelineId: string
    stageId: string
    bulkJobId: string
  }): Promise<void> {
    await pipelineStageRepository.releaseBulkClaim({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      id: input.stageId,
      bulkJobId: input.bulkJobId,
    })
  }

  // Internals -------------------------------------------------------------------

  /** Whether a stage claim still has an owner: a live job, or a recent claim that may be enqueueing. */
  private async isClaimHeld(bulkJobId: string): Promise<boolean> {
    if (await this.isJobLive(bulkJobId)) {
      return true
    }
    const createdAt = stageClaimCreatedAt(bulkJobId)
    return (
      createdAt !== null &&
      Date.now() - createdAt < STAGE_CLAIM_ENQUEUE_GRACE_MS
    )
  }

  private async isJobLive(jobId: string): Promise<boolean> {
    const job = await defaultQueue.getJob(jobId)
    if (!job) {
      return false
    }
    const state = await job.getState()
    return state !== "failed" && state !== "completed"
  }

  /** The destination stage of a move, or null when it no longer exists. */
  private resolveRemoval(
    stages: PipelineStageModel[],
    mode: StageRemovalMode,
  ): ResolvedRemoval | null {
    if (mode.kind === "delete") {
      return mode
    }
    const target = stages.find((candidate) => candidate.id === mode.toStageId)
    return target ? { kind: "move", target } : null
  }

  private requireRemovable(
    stages: PipelineStageModel[],
    stageId: string,
    mode: StageRemovalMode,
  ): { stage: PipelineStageModel; removal: ResolvedRemoval } {
    const stage = stages.find((candidate) => candidate.id === stageId)
    if (!stage) {
      throw notFoundException("Stage not found")
    }
    // While any stage is being drained by a job, deleting another stage could
    // remove the destination the job is moving items into.
    if (
      stages.some(
        (candidate) => candidate.bulkJobId && candidate.id !== stageId,
      )
    ) {
      throw conflictException("Another stage is being processed", "stageBusy")
    }
    if (stages.length <= 1) {
      throw validationException(
        "stageId",
        "A pipeline needs at least one stage",
      )
    }
    const removal = this.resolveRemoval(stages, mode)
    if (!removal) {
      throw validationException(
        "moveItemsToStageId",
        "Choose a different stage of this pipeline",
      )
    }
    if (removal.kind === "move") {
      if (removal.target.id === stage.id) {
        throw validationException(
          "moveItemsToStageId",
          "Choose a different stage of this pipeline",
        )
      }
      if (removal.target.bulkJobId) {
        throw conflictException("The destination stage is busy", "stageBusy")
      }
    }
    return { stage, removal }
  }

  /** Processes the stage's items; returns how many rows it handled. */
  private async drain(input: {
    tx: DatabaseClient
    pipeline: PipelineModel
    stage: PipelineStageModel
    stages: PipelineStageModel[]
    removal: ResolvedRemoval
    actor: PipelineActor
    effects: PipelineEffect[]
    batchLimit: number
    singleBatch?: boolean
  }): Promise<number> {
    const { tx, pipeline, stage, removal, actor, effects } = input
    const workspaceId = pipeline.workspaceId
    const stageNames = new Map(input.stages.map((s) => [s.id, s.name]))
    let handled = 0
    let emptyRounds = 0
    for (;;) {
      const now = new Date()
      const rows =
        removal.kind === "move"
          ? await pipelineItemRepository.moveStageItemsBatch(
              {
                workspaceId,
                pipelineId: pipeline.id,
                fromStageId: stage.id,
                toStageId: removal.target.id,
                limit: input.batchLimit,
                now,
              },
              tx,
            )
          : await pipelineItemRepository.deleteStageItemsBatch(
              {
                workspaceId,
                pipelineId: pipeline.id,
                stageId: stage.id,
                limit: input.batchLimit,
              },
              tx,
            )
      if (rows.length === 0) {
        // A batch whose candidates all left the stage while waiting on a row
        // lock comes back empty with rows still behind it: only an empty stage
        // ends the drain.
        const remaining = await pipelineItemRepository.countByStage(
          { workspaceId, pipelineId: pipeline.id, stageId: stage.id },
          tx,
        )
        if (remaining === 0) {
          break
        }
        emptyRounds += 1
        if (emptyRounds >= MAX_EMPTY_DRAIN_ROUNDS) {
          throw new Error(
            `Stage ${stage.id} still holds items after ${MAX_EMPTY_DRAIN_ROUNDS} empty drain batches`,
          )
        }
        continue
      }
      emptyRounds = 0
      handled += rows.length
      await pipelineActivityRepository.insertMany(
        rows.map((item) =>
          removal.kind === "move"
            ? activityRowFor(
                "stageChanged",
                { item, actor, now },
                { fromStageId: stage.id, toStageId: item.stageId },
              )
            : activityRowFor(
                "deleted",
                { item, actor, now },
                { fromStageId: stage.id },
              ),
        ),
        tx,
      )
      if (removal.kind === "move") {
        const { target } = removal
        for (const item of rows) {
          // One `bulk` realtime event per run replaces a refresh per item.
          effects.push(
            ...effectsFromDiff(
              { stage: { from: stage.id, to: target.id } },
              { pipeline, stage: target, item, actor, stageNames },
            ).filter((effect) => effect.kind !== "realtime"),
          )
        }
      }
      if (input.singleBatch) {
        break
      }
    }
    return handled
  }

  /** Deletes the stage and closes the position gap it leaves. */
  private async removeStageRow(input: {
    tx: DatabaseClient
    workspaceId: string
    pipelineId: string
    stageId: string
  }) {
    const { tx, workspaceId, pipelineId, stageId } = input
    await pipelineStageRepository.delete(
      { workspaceId, pipelineId, id: stageId },
      tx,
    )
    const remaining = await pipelineStageRepository.listByPipeline(
      { workspaceId, pipelineId },
      tx,
    )
    await pipelineStageRepository.reorder(
      { workspaceId, pipelineId, stageIds: remaining.map((stage) => stage.id) },
      tx,
    )
  }

  private async finish(
    workspaceId: string,
    pipelineId: string,
    effects: PipelineEffect[],
  ) {
    await dispatchPipelineEffects([
      ...effects,
      realtimeEffect({ workspaceId, pipelineId }, "bulk"),
    ])
  }
}

export const pipelineStageBulkService = new PipelineStageBulkService()
