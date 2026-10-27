import { db } from "@chatbotx.io/database/client"
import {
  collectReferencesByKind,
  type TemplateExport,
} from "@chatbotx.io/flow-config"

type PipelineManifest = TemplateExport["manifests"]["pipelines"]

const PIPELINE_KINDS = ["pipeline", "pipelineStage", "pipelineField"] as const

/**
 * Builds `manifests.pipelines` for the pipelines the exported flows point at
 * (directly, or through one of their stages or custom fields). Every stage and
 * field of a referenced pipeline ships, so install can match by name.
 */
export const collectPipelineManifest = async (
  workspaceId: string,
  flows: readonly { nodes: readonly unknown[]; edges: readonly unknown[] }[],
): Promise<PipelineManifest> => {
  const referenced = new Map<string, Set<string>>()
  for (const flow of flows) {
    const byKind = collectReferencesByKind(
      { nodes: flow.nodes, edges: flow.edges },
      PIPELINE_KINDS,
    )
    for (const [kind, ids] of byKind) {
      const bucket = referenced.get(kind) ?? new Set<string>()
      for (const id of ids) {
        bucket.add(id)
      }
      referenced.set(kind, bucket)
    }
  }
  const pipelineIds = new Set(referenced.get("pipeline"))
  const stageIds = [...(referenced.get("pipelineStage") ?? [])]
  const fieldIds = [...(referenced.get("pipelineField") ?? [])]
  if (stageIds.length > 0) {
    const stages = await db.query.pipelineStageModel.findMany({
      where: { workspaceId, id: { in: stageIds } },
      columns: { pipelineId: true },
    })
    for (const stage of stages) {
      pipelineIds.add(stage.pipelineId)
    }
  }
  if (fieldIds.length > 0) {
    const fields = await db.query.pipelineFieldModel.findMany({
      where: { workspaceId, id: { in: fieldIds } },
      columns: { pipelineId: true },
    })
    for (const field of fields) {
      pipelineIds.add(field.pipelineId)
    }
  }
  if (pipelineIds.size === 0) {
    return {}
  }

  const ids = [...pipelineIds]
  const [pipelines, stages, fields] = await Promise.all([
    db.query.pipelineModel.findMany({
      where: { workspaceId, id: { in: ids } },
    }),
    db.query.pipelineStageModel.findMany({
      where: { workspaceId, pipelineId: { in: ids } },
      orderBy: { position: "asc" },
    }),
    db.query.pipelineFieldModel.findMany({
      where: { workspaceId, pipelineId: { in: ids } },
      orderBy: { position: "asc" },
    }),
  ])
  return Object.fromEntries(
    pipelines.map((pipeline) => [
      pipeline.id,
      {
        name: pipeline.name,
        referenceName: pipeline.referenceName,
        type: pipeline.type,
        currency: pipeline.currency,
        settings: { ...pipeline.settings },
        stages: stages
          .filter((stage) => stage.pipelineId === pipeline.id)
          .map((stage) => ({
            sourceId: stage.id,
            name: stage.name,
            description: stage.description,
            textColor: stage.textColor,
            backgroundColor: stage.backgroundColor,
          })),
        fields: fields
          .filter((field) => field.pipelineId === pipeline.id)
          .map((field) => ({
            sourceId: field.id,
            name: field.name,
            referenceName: field.referenceName,
            type: field.type,
            required: field.required,
          })),
      },
    ]),
  )
}
