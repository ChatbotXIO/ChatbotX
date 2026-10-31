import { db } from "@chatbotx.io/database/client"
import type { TemplatePipelineManifestEntry } from "@chatbotx.io/flow-config"
import { pipelineTemplateService } from "../../pipeline/pipeline-template.service"
import {
  EMPTY_COLLECT_RESULT,
  updateNotSupported,
  verifyOwnedIds,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type TemplatePipelineEntry = TemplatePipelineManifestEntry & {
  sourceId: string
}

const ensureMap = (ctx: TemplateInstallContext, kind: string) => {
  const existing = ctx.idMaps[kind]
  if (existing) {
    return existing
  }
  const created = new Map<string, string>()
  ctx.idMaps[kind] = created
  return created
}

/**
 * Pipelines selected on their own (not only as a dependency of a flow). Same
 * semantics as the pipelines manifest: find-or-create by reference name,
 * stages by name, fields by reference name, through the same
 * `pipelineTemplateService.resolveTemplateEntry`. A pipeline the flows
 * manifest already resolved is not resolved a second time; its provenance row
 * is the manifest's (the lock is keyed by kind, so it governs either way).
 *
 * Conservative by design: a sync never updates a pipeline in place (no `sync`
 * handler, so it is reported `notUpdatable`), and an uninstall keeps it
 * detached (`pipeline` is a shared kind there). Items and members never ship.
 */
export const pipelinesAdapter: ResourceAdapter<TemplatePipelineEntry> = {
  category: "pipelines",
  providesKinds: ["pipeline"],
  consumesKinds: [],
  deferredKinds: [],
  trackedKind: "pipeline",
  folderTypes: [],
  minFormatVersion: 2,
  sync: updateNotSupported("pipelines"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplatePipelineEntry[],
  ): Promise<PatchTask[]> {
    const pipelineMap = ensureMap(ctx, "pipeline")
    const stageMap = ensureMap(ctx, "pipelineStage")
    const fieldMap = ensureMap(ctx, "pipelineField")
    for (const raw of entries) {
      const { sourceId, ...entry } = raw
      if (pipelineMap.has(sourceId)) {
        continue
      }
      const resolved = await pipelineTemplateService.resolveTemplateEntry({
        tx: ctx.tx,
        workspaceId: ctx.workspaceId,
        entry,
      })
      pipelineMap.set(sourceId, resolved.pipeline.id)
      for (const [source, target] of resolved.stageIds) {
        stageMap.set(source, target)
      }
      for (const [source, target] of resolved.fieldIds) {
        fieldMap.set(source, target)
      }
      ctx.track({
        category: "pipelines",
        resourceKind: "pipeline",
        resourceId: resolved.pipeline.id,
        sourceResourceId: sourceId,
        wasExisting: !resolved.created,
      })
      for (const value of resolved.unmatchedStages) {
        ctx.warn({
          category: "pipelines",
          entityKind: "pipelineStage",
          path: `pipelines.${sourceId}`,
          value,
        })
      }
      for (const value of resolved.unmatchedFields) {
        ctx.warn({
          category: "pipelines",
          entityKind: "pipelineField",
          path: `pipelines.${sourceId}`,
          value,
        })
      }
    }
    return []
  },

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.pipelineModel.findMany({
        where: { workspaceId },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.pipelineModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const wanted = [...ids]
      const [pipelines, stages, fields] = await Promise.all([
        db.query.pipelineModel.findMany({
          where: { workspaceId, id: { in: wanted } },
        }),
        db.query.pipelineStageModel.findMany({
          where: { workspaceId, pipelineId: { in: wanted } },
          orderBy: { position: "asc" },
        }),
        db.query.pipelineFieldModel.findMany({
          where: { workspaceId, pipelineId: { in: wanted } },
          orderBy: { position: "asc" },
        }),
      ])
      const stagesByPipeline = Map.groupBy(stages, (stage) => stage.pipelineId)
      const fieldsByPipeline = Map.groupBy(fields, (field) => field.pipelineId)
      // Same shape as `manifests.pipelines` (collect-pipelines.ts) plus the
      // entry's own `sourceId`: every stage and field ships so install can
      // match by name. No items, members or assignees.
      const entries = pipelines.map((pipeline) => ({
        sourceId: pipeline.id,
        name: pipeline.name,
        referenceName: pipeline.referenceName,
        type: pipeline.type,
        currency: pipeline.currency,
        settings: { ...pipeline.settings },
        stages: (stagesByPipeline.get(pipeline.id) ?? []).map((stage) => ({
          sourceId: stage.id,
          name: stage.name,
          description: stage.description,
          textColor: stage.textColor,
          backgroundColor: stage.backgroundColor,
        })),
        fields: (fieldsByPipeline.get(pipeline.id) ?? []).map((field) => ({
          sourceId: field.id,
          name: field.name,
          referenceName: field.referenceName,
          type: field.type,
          required: field.required,
        })),
      }))
      return {
        entries,
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}
