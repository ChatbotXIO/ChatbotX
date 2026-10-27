import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  mergePipelineSettings,
  PIPELINE_LIMITS,
  type PipelineSettingsPatch,
  type PipelineType,
  pipelineTypeDefaults,
} from "@chatbotx.io/database/partials"
import {
  acquirePipelineAdvisoryLock,
  type PipelineUpdate,
  pipelineActivityRepository,
  pipelineItemRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import { pipelineModel } from "@chatbotx.io/database/schema"
import type {
  PipelineFieldModel,
  PipelineModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { conflictException, notFoundException } from "../errors"
import { type IdLabel, selectLabelsByIds } from "../select-labels-by-ids"
import {
  type PipelineAccessScope,
  type PipelinePermissions,
  resolvePipelinePermissions,
} from "./access"
import { pipelineCountsCacheTag } from "./mutation-engine"
import { PipelineBaseService } from "./pipeline-base.service"
import { membersForCopy } from "./pipeline-member.service"
import type { PipelineActor } from "./types"

export type {
  PipelineFieldValues,
  StageValues,
} from "./pipeline-structure.service"

const LIST_CACHE_TTL_SECONDS = 60

export type PipelineListEntry = {
  pipeline: PipelineModel
  itemsCount: number
}

/** A list entry with what the asking scope may do with it (never cached). */
export type PipelineListEntryWithPermissions = PipelineListEntry & {
  permissions: PipelinePermissions
}

type CreatePipelineInput = {
  workspaceId: string
  type: PipelineType
  name: string
  scope: PipelineAccessScope
  actor: PipelineActor
}

type UpdatePipelineInput = {
  workspaceId: string
  id: string
  scope: PipelineAccessScope
  values: {
    name?: string
    referenceName?: string
    currency?: string
    /** Merged key by key over the stored settings; omitted groups and keys keep their stored values. */
    settings?: PipelineSettingsPatch
  }
}

export class PipelineService extends PipelineBaseService {
  // Reads ---------------------------------------------------------------------

  /** Pipelines the scope can view, with their item counts. */
  async list(input: {
    workspaceId: string
    scope: PipelineAccessScope
  }): Promise<PipelineListEntry[]> {
    const entries = await this.listWithPermissions(input)
    return entries.map(({ pipeline, itemsCount }) => ({ pipeline, itemsCount }))
  }

  /** Pipelines the scope can view, without counting their items. */
  async listViewable(input: {
    workspaceId: string
    scope: PipelineAccessScope
  }): Promise<PipelineModel[]> {
    const pipelines = await this.cachedRows(input.workspaceId)
    const permissions = await this.viewPermissions(input, pipelines)
    return pipelines.filter((pipeline) => permissions.get(pipeline.id)?.canView)
  }

  /**
   * Viewable pipelines, each with the scope's permissions on it. The cached
   * list is scope-independent; permissions are resolved after the cache read
   * from one ACL query, never per row.
   */
  async listWithPermissions(input: {
    workspaceId: string
    scope: PipelineAccessScope
  }): Promise<PipelineListEntryWithPermissions[]> {
    const { workspaceId } = input
    // Rows change only with pipeline or structure edits; counts are dropped
    // only by writes that add or remove items (see dispatchPipelineEffects),
    // so edits and moves keep both cached.
    const [pipelines, counts] = await Promise.all([
      this.cachedRows(workspaceId),
      withCache(
        `pipelines:${workspaceId}:counts`,
        async () => await pipelineRepository.countItemsByPipeline(workspaceId),
        {
          ttl: LIST_CACHE_TTL_SECONDS,
          tags: [
            this.cacheTag(workspaceId),
            pipelineCountsCacheTag(workspaceId),
          ],
        },
      ),
    ])
    const countByPipeline = new Map(
      counts.map((row) => [row.pipelineId, row.itemsCount]),
    )
    const permissions = await this.viewPermissions(input, pipelines)
    return pipelines.flatMap((pipeline) => {
      const granted = permissions.get(pipeline.id)
      return granted?.canView
        ? [
            {
              pipeline,
              itemsCount: countByPipeline.get(pipeline.id) ?? 0,
              permissions: granted,
            },
          ]
        : []
    })
  }

  private async cachedRows(workspaceId: string): Promise<PipelineModel[]> {
    return await withCache(
      `pipelines:${workspaceId}:rows`,
      async () => await pipelineRepository.listByWorkspace(workspaceId),
      { ttl: LIST_CACHE_TTL_SECONDS, tags: [this.cacheTag(workspaceId)] },
    )
  }

  /** The scope's permissions on each pipeline, from at most one ACL query. */
  private async viewPermissions(
    input: { workspaceId: string; scope: PipelineAccessScope },
    pipelines: PipelineModel[],
  ): Promise<Map<string, PipelinePermissions>> {
    const { workspaceId, scope } = input
    if (scope.kind !== "member" || scope.isWorkspaceAdmin) {
      const all = resolvePipelinePermissions(scope, null)
      return new Map(pipelines.map((pipeline) => [pipeline.id, all]))
    }
    const rows = await pipelineRepository.listMemberAccess({
      workspaceId,
      workspaceMemberId: scope.workspaceMemberId,
    })
    const rowByPipeline = new Map(rows.map((row) => [row.pipelineId, row]))
    return new Map(
      pipelines.map((pipeline) => [
        pipeline.id,
        resolvePipelinePermissions(
          scope,
          rowByPipeline.get(pipeline.id) ?? null,
        ),
      ]),
    )
  }

  async get(input: {
    workspaceId: string
    id: string
    scope: PipelineAccessScope
  }): Promise<{
    pipeline: PipelineModel
    stages: PipelineStageModel[]
    fields: PipelineFieldModel[]
    permissions: PipelinePermissions
  }> {
    const { pipeline, permissions } = await this.requireAccessWithPermissions({
      workspaceId: input.workspaceId,
      pipelineId: input.id,
      scope: input.scope,
      action: "view",
    })
    const [stages, fields] = await Promise.all([
      pipelineStageRepository.listByPipeline({
        workspaceId: input.workspaceId,
        pipelineId: pipeline.id,
      }),
      pipelineRepository.listFields({
        workspaceId: input.workspaceId,
        pipelineId: pipeline.id,
      }),
    ])
    return { pipeline, stages, fields, permissions }
  }

  /** A pipeline's custom fields in display order (requires view access). */
  async listFields(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
  }): Promise<PipelineFieldModel[]> {
    const { pipeline } = await this.requireAccessWithPermissions({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: "view",
    })
    return await pipelineRepository.listFields({
      workspaceId: input.workspaceId,
      pipelineId: pipeline.id,
    })
  }

  /** Pipelines the scope can view, each with its stages in board order. */
  async listWithStages(input: {
    workspaceId: string
    scope: PipelineAccessScope
  }): Promise<
    Array<{ pipeline: PipelineModel; stages: PipelineStageModel[] }>
  > {
    // No item counts here: only the cached rows and the ACL are needed.
    const pipelines = await this.listViewable(input)
    const stages = await pipelineStageRepository.listByPipelineIds({
      workspaceId: input.workspaceId,
      pipelineIds: pipelines.map((pipeline) => pipeline.id),
    })
    return pipelines.map((pipeline) => ({
      pipeline,
      stages: stages.filter((stage) => stage.pipelineId === pipeline.id),
    }))
  }

  /**
   * Every pipeline of the workspace with its stages and custom fields, for
   * flow-spec authoring. Three queries total (pipelines, stages, fields);
   * uncached so a pipeline created a moment ago resolves. Not access-scoped:
   * flow steps run as the workspace, like `runPipelineFlowAction`.
   */
  async listAuthoringCatalog(input: { workspaceId: string }): Promise<
    Array<{
      pipeline: PipelineModel
      stages: PipelineStageModel[]
      fields: PipelineFieldModel[]
    }>
  > {
    const pipelines = await pipelineRepository.listByWorkspace(
      input.workspaceId,
    )
    const pipelineIds = pipelines.map((pipeline) => pipeline.id)
    const [stages, fields] = await Promise.all([
      pipelineStageRepository.listByPipelineIds({
        workspaceId: input.workspaceId,
        pipelineIds,
      }),
      pipelineRepository.listFieldsByPipelineIds({
        workspaceId: input.workspaceId,
        pipelineIds,
      }),
    ])
    return pipelines.map((pipeline) => ({
      pipeline,
      stages: stages.filter((stage) => stage.pipelineId === pipeline.id),
      fields: fields.filter((field) => field.pipelineId === pipeline.id),
    }))
  }

  /** Existing pipelines the scope can view; any other id comes back absent. */
  async listLabelsByIds(input: {
    workspaceId: string
    ids: string[]
    scope: PipelineAccessScope
  }): Promise<IdLabel[]> {
    if (input.ids.length === 0) {
      return []
    }
    const viewable = await this.viewableIds(input.workspaceId, input.scope)
    return (await selectLabelsByIds(pipelineModel, input)).filter((label) =>
      viewable.has(label.id),
    )
  }

  /** Existing stages of pipelines the scope can view; others come back absent. */
  async listStageLabelsByIds(input: {
    workspaceId: string
    ids: string[]
    scope: PipelineAccessScope
  }): Promise<IdLabel[]> {
    if (input.ids.length === 0) {
      return []
    }
    const [stages, viewable] = await Promise.all([
      pipelineStageRepository.listNamesByIds({
        workspaceId: input.workspaceId,
        ids: input.ids,
      }),
      this.viewableIds(input.workspaceId, input.scope),
    ])
    return stages
      .filter((stage) => viewable.has(stage.pipelineId))
      .map((stage) => ({ id: stage.id, name: stage.name }))
  }

  private async viewableIds(
    workspaceId: string,
    scope: PipelineAccessScope,
  ): Promise<Set<string>> {
    const pipelines = await this.listViewable({ workspaceId, scope })
    return new Set(pipelines.map((pipeline) => pipeline.id))
  }

  // Pipeline mutations --------------------------------------------------------

  async create(input: CreatePipelineInput): Promise<PipelineModel> {
    const { workspaceId, type, scope, actor } = input
    const currency = await this.defaultCurrency(workspaceId)

    const created = await db.transaction(async (tx) => {
      await acquirePipelineAdvisoryLock(tx, this.namingLockKey(workspaceId))
      const { name, referenceName } = await this.allocateNames(
        { workspaceId, name: input.name },
        tx,
      )
      const pipeline = await pipelineRepository.insert(
        {
          workspaceId,
          name,
          type,
          referenceName,
          currency,
          settings: this.defaultSettingsFor(type),
          createdById: actor.userId,
        },
        tx,
      )
      await pipelineStageRepository.insert(
        {
          workspaceId,
          pipelineId: pipeline.id,
          name: pipelineTypeDefaults[type].firstStageName,
          position: 0,
        },
        tx,
      )
      // Admins, owners, tokens and support bypass the ACL; only a plain member
      // needs a row to keep access to what they just created.
      if (scope.kind === "member" && !scope.isWorkspaceAdmin) {
        await pipelineRepository.upsertMember(
          {
            workspaceId,
            pipelineId: pipeline.id,
            workspaceMemberId: scope.workspaceMemberId,
            values: {
              canView: true,
              canEdit: true,
              canDelete: true,
              canManageSettings: true,
            },
          },
          tx,
        )
      }
      return pipeline
    })

    await this.invalidateList(workspaceId)
    await this.audit("create", `created pipeline ${created.id}`)
    return created
  }

  async update(input: UpdatePipelineInput): Promise<PipelineModel> {
    const { workspaceId, id, values } = input
    await this.requireAccess({
      workspaceId,
      pipelineId: id,
      scope: input.scope,
      action: "manageSettings",
    })

    const updated = await db.transaction(async (tx) => {
      await acquirePipelineAdvisoryLock(tx, this.namingLockKey(workspaceId))
      const patch: PipelineUpdate = {}
      if (values.name !== undefined) {
        await this.assertNameFree(
          { workspaceId, column: "name", value: values.name, exceptId: id },
          tx,
        )
        patch.name = values.name
      }
      if (values.referenceName !== undefined) {
        await this.assertNameFree(
          {
            workspaceId,
            column: "referenceName",
            value: values.referenceName,
            exceptId: id,
          },
          tx,
        )
        patch.referenceName = values.referenceName
      }
      if (values.currency !== undefined) {
        patch.currency = values.currency
      }
      if (values.settings !== undefined) {
        const current = await pipelineRepository.findById(
          { workspaceId, id },
          tx,
        )
        if (!current) {
          throw notFoundException("Pipeline not found")
        }
        patch.settings = mergePipelineSettings(
          current.settings,
          values.settings,
        )
      }
      const row = await pipelineRepository.update(
        { workspaceId, id, values: patch },
        tx,
      )
      if (!row) {
        throw notFoundException("Pipeline not found")
      }
      return row
    })

    // Open boards refetch so a new currency, label or visible feature shows
    // in every session, not only the one that saved it.
    await this.afterStructureChange(workspaceId, id)
    await this.audit("update", `updated pipeline ${id}`)
    return updated
  }

  async delete(input: {
    workspaceId: string
    id: string
    scope: PipelineAccessScope
  }): Promise<void> {
    await this.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.id,
      scope: input.scope,
      action: "delete",
    })
    await this.drainPipelineRows(input.workspaceId, input.id)
    await db.transaction(async (tx) => {
      await acquirePipelineAdvisoryLock(
        tx,
        this.structureLockKey(input.workspaceId, input.id),
      )
      await this.assertNoBulkJob(input.workspaceId, input.id, tx)
      // What is left (rows written since the last batch) is small, so the
      // cascade of this final statement is bounded.
      if (
        !(await pipelineRepository.delete(
          { workspaceId: input.workspaceId, id: input.id },
          tx,
        ))
      ) {
        throw notFoundException("Pipeline not found")
      }
    })
    await this.afterStructureChange(input.workspaceId, input.id)
    await this.audit("delete", `deleted pipeline ${input.id}`)
  }

  /** A stage owned by a queued job means the pipeline is being restructured. */
  private async assertNoBulkJob(
    workspaceId: string,
    pipelineId: string,
    tx: DatabaseClient,
  ) {
    const stages = await pipelineStageRepository.listByPipeline(
      { workspaceId, pipelineId },
      tx,
    )
    if (stages.some((stage) => stage.bulkJobId)) {
      throw conflictException(
        "A stage of this pipeline is being updated. Try again shortly.",
        "stageBusy",
      )
    }
  }

  /**
   * Deletes the pipeline's items and activity in short transactions so the
   * final pipeline delete does not cascade a huge table inside one request.
   * The structure lock is taken per batch, never across batches.
   */
  private async drainPipelineRows(workspaceId: string, pipelineId: string) {
    const limit = PIPELINE_LIMITS.bulkBatchSize
    for (const step of ["items", "activity"] as const) {
      for (;;) {
        const removed = await db.transaction(async (tx) => {
          await acquirePipelineAdvisoryLock(
            tx,
            this.structureLockKey(workspaceId, pipelineId),
          )
          await this.requireAccess({
            workspaceId,
            pipelineId,
            scope: { kind: "support" },
            action: "view",
            tx,
          })
          await this.assertNoBulkJob(workspaceId, pipelineId, tx)
          return step === "items"
            ? await pipelineItemRepository.deletePipelineItemsBatch(
                { workspaceId, pipelineId, limit },
                tx,
              )
            : await pipelineActivityRepository.deleteByPipelineBatch(
                { workspaceId, pipelineId, limit },
                tx,
              )
        })
        if (removed === 0) {
          break
        }
      }
    }
  }

  /** Copies structure (stages, fields, members), never items. */
  async duplicate(input: {
    workspaceId: string
    id: string
    scope: PipelineAccessScope
    actor: PipelineActor
  }): Promise<PipelineModel> {
    const { workspaceId, scope } = input
    const source = await this.requireAccess({
      workspaceId,
      pipelineId: input.id,
      scope,
      action: "view",
    })

    const copy = await db.transaction(async (tx) => {
      await acquirePipelineAdvisoryLock(tx, this.namingLockKey(workspaceId))
      const [stages, fields, members] = await Promise.all([
        pipelineStageRepository.listByPipeline(
          { workspaceId, pipelineId: source.id },
          tx,
        ),
        pipelineRepository.listFields(
          { workspaceId, pipelineId: source.id },
          tx,
        ),
        pipelineRepository.listMembers(
          { workspaceId, pipelineId: source.id },
          tx,
        ),
      ])
      const { name, referenceName } = await this.allocateNames(
        { workspaceId, name: `${source.name} copy` },
        tx,
      )
      const pipeline = await pipelineRepository.insert(
        {
          workspaceId,
          name,
          type: source.type,
          referenceName,
          currency: source.currency,
          settings: source.settings,
          createdById: input.actor.userId,
        },
        tx,
      )
      await pipelineStageRepository.insertMany(
        stages.map((stage) => ({
          workspaceId,
          pipelineId: pipeline.id,
          name: stage.name,
          description: stage.description,
          textColor: stage.textColor,
          backgroundColor: stage.backgroundColor,
          position: stage.position,
        })),
        tx,
      )
      await pipelineRepository.insertFields(
        fields.map((field) => ({
          workspaceId,
          pipelineId: pipeline.id,
          name: field.name,
          referenceName: field.referenceName,
          type: field.type,
          required: field.required,
          position: field.position,
        })),
        tx,
      )
      await pipelineRepository.insertMembers(
        membersForCopy({
          workspaceId,
          members,
          pipelineId: pipeline.id,
          scope,
        }),
        tx,
      )
      return pipeline
    })

    await this.invalidateList(workspaceId)
    await this.audit("create", `duplicated pipeline ${source.id}`)
    return copy
  }
}

export const pipelineService = new PipelineService()
