import { db } from "@chatbotx.io/database/client"
import type { TemplatePipelineManifestEntry } from "@chatbotx.io/flow-config"
import { resolvePipelineEntry } from "./manifests/pipelines"
import {
  idMapOf,
  makeCollector,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplatePipelineEntry = TemplatePipelineManifestEntry & {
  sourceId: string
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
    const pipelineMap = idMapOf(ctx, "pipeline")
    for (const { sourceId, ...entry } of entries) {
      if (!pipelineMap.has(sourceId)) {
        await resolvePipelineEntry(ctx, sourceId, entry, {
          category: "pipelines",
          pathPrefix: "pipelines",
        })
      }
    }
    return []
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.pipelineModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
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
      return { entries }
    },
  }),
}
