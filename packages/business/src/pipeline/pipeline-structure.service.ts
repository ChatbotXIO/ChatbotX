import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { PIPELINE_LIMITS } from "@chatbotx.io/database/partials"
import {
  type PipelineFieldInsert,
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import type {
  PipelineFieldModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import { isBigintId } from "@chatbotx.io/database/utils"
import { notFoundException, validationException } from "../errors"
import type { PipelineAccessScope } from "./access"
import { sameIdSet } from "./equality"
import { nextFieldPosition } from "./naming"
import { PipelineBaseService } from "./pipeline-base.service"
import { lockStageOrder } from "./stage-order"

export type StageValues = {
  name?: string
  description?: string | null
  textColor?: string | null
  backgroundColor?: string | null
}

export type PipelineFieldValues = Pick<
  PipelineFieldInsert,
  "name" | "referenceName" | "type" | "required"
>

/** What one strip batch did and where the walk goes next. */
type StripBatchOutcome = {
  hasMore: boolean
  /** Where the next batch resumes; undefined rescans from the start. */
  lastId: string | undefined
  /** A holder that changed stage before its stage was locked, left for the next batch. */
  movedId?: string
  stripped: number
}

/** Batches in a row that made no progress because a holder kept changing stage. */
const MAX_STALLED_STRIP_BATCHES = 5

const DUPLICATE_FIELD_REFERENCE =
  "A field with this reference name already exists"

/** Stages and custom fields of a pipeline; every edit holds the structure lock. */
export class PipelineStructureService extends PipelineBaseService {
  // Stages --------------------------------------------------------------------

  async createStage(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
    name: string
    values?: StageValues
  }): Promise<PipelineStageModel> {
    const { workspaceId, pipelineId } = input
    return await this.withStructure(input, async (tx) => {
      const position = await pipelineStageRepository.nextPosition(
        { workspaceId, pipelineId },
        tx,
      )
      // `nextPosition` is the current stage count, so it doubles as the limit check.
      if (position >= PIPELINE_LIMITS.stagesPerPipeline) {
        throw validationException(
          "name",
          `A pipeline can have at most ${PIPELINE_LIMITS.stagesPerPipeline} stages`,
        )
      }
      return await pipelineStageRepository.insert(
        {
          workspaceId,
          pipelineId,
          position,
          ...stageColumns(input.values ?? {}),
          name: input.name,
        },
        tx,
      )
    })
  }

  async updateStage(input: {
    workspaceId: string
    pipelineId: string
    stageId: string
    scope: PipelineAccessScope
    values: StageValues
  }): Promise<PipelineStageModel> {
    const { workspaceId, pipelineId, stageId } = input
    return await this.withStructure(input, async (tx) => {
      const stage = await pipelineStageRepository.update(
        {
          workspaceId,
          pipelineId,
          id: stageId,
          values: stageColumns(input.values),
        },
        tx,
      )
      if (!stage) {
        throw notFoundException("Stage not found")
      }
      return stage
    })
  }

  async reorderStages(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
    stageIds: string[]
  }): Promise<void> {
    const { workspaceId, pipelineId, stageIds } = input
    await this.withStructure(input, async (tx) => {
      const current = await pipelineStageRepository.listByPipeline(
        { workspaceId, pipelineId },
        tx,
      )
      if (
        !sameIdSet(
          current.map((stage) => stage.id),
          stageIds,
        )
      ) {
        throw validationException(
          "stageIds",
          "stageIds must list every stage of the pipeline exactly once",
        )
      }
      await pipelineStageRepository.reorder(
        { workspaceId, pipelineId, stageIds },
        tx,
      )
    })
  }

  // Fields --------------------------------------------------------------------

  async createField(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
    values: PipelineFieldValues
  }): Promise<PipelineFieldModel> {
    const { workspaceId, pipelineId } = input
    return await this.withStructure(input, async (tx) => {
      const existing = await pipelineRepository.listFields(
        { workspaceId, pipelineId },
        tx,
      )
      if (
        existing.some(
          (field) => field.referenceName === input.values.referenceName,
        )
      ) {
        throw validationException("referenceName", DUPLICATE_FIELD_REFERENCE)
      }
      // An item write carries at most this many field values, so more fields
      // (some required) would make items impossible to create.
      if (existing.length >= PIPELINE_LIMITS.fieldsPerPipeline) {
        throw validationException(
          "name",
          `A pipeline can have at most ${PIPELINE_LIMITS.fieldsPerPipeline} custom fields`,
        )
      }
      return await pipelineRepository.insertField(
        {
          workspaceId,
          pipelineId,
          position: nextFieldPosition(existing),
          ...input.values,
        },
        tx,
      )
    })
  }

  async updateField(input: {
    workspaceId: string
    pipelineId: string
    fieldId: string
    scope: PipelineAccessScope
    values: Partial<
      Pick<PipelineFieldValues, "name" | "referenceName" | "required">
    >
  }): Promise<PipelineFieldModel> {
    const { workspaceId, pipelineId, fieldId } = input
    // The field type is immutable: stored item values depend on it.
    return await this.withStructure(input, async (tx) => {
      const { referenceName } = input.values
      if (referenceName !== undefined) {
        const existing = await pipelineRepository.listFields(
          { workspaceId, pipelineId },
          tx,
        )
        if (
          existing.some(
            (candidate) =>
              candidate.referenceName === referenceName &&
              candidate.id !== fieldId,
          )
        ) {
          throw validationException("referenceName", DUPLICATE_FIELD_REFERENCE)
        }
      }
      const field = await pipelineRepository.updateField(
        { workspaceId, pipelineId, id: fieldId, values: input.values },
        tx,
      )
      if (!field) {
        throw notFoundException("Field not found")
      }
      return field
    })
  }

  async deleteField(input: {
    workspaceId: string
    pipelineId: string
    fieldId: string
    scope: PipelineAccessScope
  }): Promise<void> {
    const { workspaceId, pipelineId, fieldId } = input
    const deleted = await this.structureTransaction(input, (tx) =>
      pipelineRepository.deleteField(
        { workspaceId, pipelineId, id: fieldId },
        tx,
      ),
    )
    // The field row is gone and committed. Strip its key even when it was
    // already absent: an earlier delete may have been interrupted between the
    // row delete and the strip, and a retry must still clean up. The walk is
    // idempotent and scoped to this workspace and pipeline.
    if (deleted || isBigintId(fieldId)) {
      await this.stripDeletedFieldKey(workspaceId, pipelineId, fieldId)
    }
    if (!deleted) {
      throw notFoundException("Field not found")
    }
    await this.afterStructureChange(workspaceId, pipelineId)
  }

  /**
   * Maintenance, outside the structure lock and in short transactions. With the
   * field row gone (its delete waited for in-flight writers, which hold a share
   * lock on it, and later writers reject the field) no new value for the key
   * can be committed; the keyset walk removes what earlier writers stored.
   */
  private async stripDeletedFieldKey(
    workspaceId: string,
    pipelineId: string,
    fieldId: string,
  ) {
    let afterId: string | undefined
    let stalledBatches = 0
    for (;;) {
      const batch = await db.transaction((tx) =>
        this.stripKeyBatch({ workspaceId, pipelineId, fieldId, afterId }, tx),
      )
      if (!batch.hasMore) {
        return
      }
      stalledBatches =
        batch.movedId && batch.stripped === 0 ? stalledBatches + 1 : 0
      const { movedId } = batch
      if (movedId && stalledBatches >= MAX_STALLED_STRIP_BATCHES) {
        // A holder that changes stage on every attempt: strip it alone. One
        // row lock that waits on nothing else cannot form a cycle with a
        // respace, so no stage-order key is needed.
        await db.transaction((tx) =>
          pipelineRepository.stripFieldKeyFromItems(
            { workspaceId, pipelineId, fieldId, ids: [movedId] },
            tx,
          ),
        )
        afterId = movedId
        stalledBatches = 0
        continue
      }
      afterId = batch.lastId
    }
  }

  /**
   * One batch: read the next holders, take the stage-order keys of their
   * stages, then re-read them. A holder that changed stage before the keys were
   * held is not locked: the batch strips the confirmed rows before it and
   * reports it as `movedId`, and the next batch (a fresh transaction) finds it
   * with the right keys. Rows are locked in ascending id, so this cannot form a
   * lock cycle with a respace.
   */
  private async stripKeyBatch(
    input: {
      workspaceId: string
      pipelineId: string
      fieldId: string
      afterId?: string
    },
    tx: DatabaseClient,
  ): Promise<StripBatchOutcome> {
    const { workspaceId, pipelineId, fieldId, afterId } = input
    const scope = { workspaceId, pipelineId, fieldId }
    const candidates = await pipelineRepository.listFieldKeyHolders(
      { ...scope, limit: PIPELINE_LIMITS.bulkBatchSize, afterId },
      tx,
    )
    if (candidates.length === 0) {
      return { hasMore: false, lastId: afterId, stripped: 0 }
    }
    const stageIds = [...new Set(candidates.map((row) => row.stageId))]
    // The field is already deleted: a 409 here would strand its stale keys.
    await lockStageOrder(tx, workspaceId, stageIds, "unbounded")
    const confirmed = await pipelineRepository.listFieldKeyHolders(
      { ...scope, ids: candidates.map((row) => row.id) },
      tx,
    )
    const moved = confirmed.find((row) => !stageIds.includes(row.stageId))
    const strippable = moved
      ? confirmed.filter((row) => BigInt(row.id) < BigInt(moved.id))
      : confirmed
    const stripped = await pipelineRepository.stripFieldKeyFromItems(
      { ...scope, ids: strippable.map((row) => row.id), stageIds },
      tx,
    )
    if (moved) {
      return {
        hasMore: true,
        lastId: strippable.at(-1)?.id ?? afterId,
        movedId: moved.id,
        stripped,
      }
    }
    return {
      hasMore: candidates.length >= PIPELINE_LIMITS.bulkBatchSize,
      lastId: candidates.at(-1)?.id,
      stripped,
    }
  }
}

/** The stage columns a patch sets; a color must be `#rrggbb` (or null to clear). */
export function stageColumns(values: StageValues) {
  const columns: Partial<{
    name: string
    description: string | null
    textColor: string | null
    backgroundColor: string | null
  }> = {}
  if (values.name !== undefined) {
    columns.name = values.name
  }
  if (values.description !== undefined) {
    columns.description = values.description
  }
  for (const key of ["textColor", "backgroundColor"] as const) {
    const color = values[key]
    if (color === undefined) {
      continue
    }
    if (color !== null && !PIPELINE_LIMITS.colorPattern.test(color)) {
      throw validationException(key, "Color must be a #rrggbb hex value")
    }
    columns[key] = color
  }
  return columns
}

export const pipelineStructureService = new PipelineStructureService()
