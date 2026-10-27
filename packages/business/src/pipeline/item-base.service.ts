import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  pipelineItemRepository,
  pipelineReferenceRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import type {
  PipelineItemModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import type { PipelineAccessScope, PipelineAction } from "./access"
import { dispatchPipelineEffects, type PipelineEffect } from "./mutation-engine"
import { pipelineService } from "./service"

export type MutationContext = {
  tx: DatabaseClient
  effects: PipelineEffect[]
}

type ItemRef = {
  workspaceId: string
  pipelineId: string
  itemId: string
}

/** Transaction, locking and stage plumbing shared by the item services. */
export class PipelineItemBaseService extends BaseService {
  /**
   * Runs `work` in a transaction, then dispatches the effects it collected.
   * A rolled-back transaction emits nothing; an effect failure is logged only.
   */
  protected async mutate<T>(
    work: (context: MutationContext) => Promise<T>,
  ): Promise<T> {
    const effects: PipelineEffect[] = []
    const result = await db.transaction(
      async (tx) => await work({ tx, effects }),
    )
    await dispatchPipelineEffects(effects)
    return result
  }

  /**
   * Checks the scope holds `permission` on the pipeline, then runs `work` in a
   * transaction with the item row-locked and its pipeline re-checked.
   */
  protected async withLockedItem<T>(
    input: ItemRef & { scope: PipelineAccessScope },
    permission: PipelineAction,
    work: (
      context: MutationContext & { item: PipelineItemModel },
    ) => Promise<T>,
  ): Promise<T> {
    await pipelineService.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: permission,
    })
    return await this.mutate(async (context) => {
      const item = await this.lockItemOrFail({ ...input, tx: context.tx })
      return await work({ ...context, item })
    })
  }

  protected openLockKey(
    workspaceId: string,
    pipelineId: string,
    contactId: string,
  ) {
    return `pipeline-item:${workspaceId}:${pipelineId}:${contactId}`
  }

  /**
   * Row-locks the item and re-checks its pipeline: a transfer or another
   * comment writer that committed first is seen, and child writes (comments,
   * attachments, `lastCommentAt`) are serialised per item.
   */
  protected async lockItemOrFail(
    input: ItemRef & { tx: DatabaseClient },
  ): Promise<PipelineItemModel> {
    const item = await pipelineItemRepository.lockForUpdate(
      { workspaceId: input.workspaceId, id: input.itemId },
      input.tx,
    )
    if (!item || item.pipelineId !== input.pipelineId) {
      throw notFoundException("Item not found")
    }
    return item
  }

  protected async findItemOrFail(
    input: ItemRef & { tx: DatabaseClient },
  ): Promise<PipelineItemModel> {
    const item = await pipelineItemRepository.findById(
      {
        workspaceId: input.workspaceId,
        id: input.itemId,
        pipelineId: input.pipelineId,
      },
      input.tx,
    )
    if (!item) {
      throw notFoundException("Item not found")
    }
    return item
  }

  /** Shared row lock on the stage, so it cannot be deleted under the write. */
  protected async lockStage(
    stage: PipelineStageModel,
    tx: DatabaseClient,
  ): Promise<PipelineStageModel> {
    const locked = await pipelineStageRepository.lockShared(
      { workspaceId: stage.workspaceId, id: stage.id },
      tx,
    )
    if (!locked) {
      throw notFoundException("Stage not found")
    }
    // A bulk job may have claimed the stage while this writer waited.
    this.assertStageNotBulkOwned(locked)
    return locked
  }

  protected stageById(
    stages: PipelineStageModel[],
    stageId: string,
  ): PipelineStageModel {
    const stage = stages.find((candidate) => candidate.id === stageId)
    if (!stage) {
      throw notFoundException("Stage not found")
    }
    return stage
  }

  /** Items cannot enter or leave a stage a queued job is draining. */
  protected assertStageNotBulkOwned(stage: PipelineStageModel) {
    if (stage.bulkJobId) {
      throw conflictException(
        "This stage is being updated. Try again shortly.",
        "stageBusy",
      )
    }
  }

  /** The requested stage, or the pipeline's first; never one a bulk job owns. */
  protected resolveStage(
    stages: PipelineStageModel[],
    stageId?: string,
  ): PipelineStageModel {
    const stage = stageId ? this.stageById(stages, stageId) : stages[0]
    if (!stage) {
      throw validationException("stageId", "The pipeline has no stage")
    }
    this.assertStageNotBulkOwned(stage)
    return stage
  }

  protected async assertMediaFiles(
    workspaceId: string,
    ids: string[],
    tx: DatabaseClient,
  ) {
    const unique = [...new Set(ids)]
    const found = await pipelineReferenceRepository.listMediaLibraryFileIds(
      { workspaceId, ids: unique },
      tx,
    )
    if (found.length !== unique.length) {
      throw notFoundException("Attachment file not found")
    }
  }
}
