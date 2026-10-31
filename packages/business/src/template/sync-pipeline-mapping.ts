import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import type { TemplatePipelineManifestEntry } from "@chatbotx.io/flow-config"
import type { TemplateInstallContext } from "./adapters/types"

/** Stage names match case- and space-insensitively, as on install. */
const stageKey = (name: string) => name.trim().toLowerCase()

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
 * The pipeline-to-pipeline mapping is durable, but the stage and field
 * mappings only ever lived in memory of the install that resolved them. A sync
 * sees the pipeline as already mapped and would otherwise leave its stage and
 * field references unmapped (and so cleared by the sanitizer). This rebuilds
 * them against the mapped target: stages by name in board order (each target
 * stage claimed once), fields by reference name and type. Read-only: a stage
 * or field the target lacks stays unmapped and is reported, never created.
 */
export const rebuildPipelineChildMappings = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplatePipelineManifestEntry>>,
  tx: DatabaseClient,
): Promise<void> => {
  const pipelineMap = ctx.idMaps.pipeline
  if (!pipelineMap) {
    return
  }
  const stageMap = ensureMap(ctx, "pipelineStage")
  const fieldMap = ensureMap(ctx, "pipelineField")
  for (const [sourceId, entry] of Object.entries(manifest)) {
    const pipelineId = pipelineMap.get(sourceId)
    if (!pipelineId) {
      continue
    }
    const key = { workspaceId: ctx.workspaceId, pipelineId }
    const stages = await pipelineStageRepository.listByPipeline(key, tx)
    const unclaimedByName = Map.groupBy(stages, (stage) => stageKey(stage.name))
    for (const source of entry.stages) {
      const target = unclaimedByName.get(stageKey(source.name))?.shift()
      if (target) {
        stageMap.set(source.sourceId, target.id)
      } else {
        ctx.warn({
          category: "flows",
          entityKind: "pipelineStage",
          path: `manifests.pipelines.${sourceId}`,
          value: source.sourceId,
        })
      }
    }
    const fields = await pipelineRepository.listFields(key, tx)
    const fieldByReference = new Map(
      fields.map((field) => [field.referenceName, field]),
    )
    for (const source of entry.fields) {
      const target = fieldByReference.get(source.referenceName)
      if (target && target.type === source.type) {
        fieldMap.set(source.sourceId, target.id)
      } else {
        ctx.warn({
          category: "flows",
          entityKind: "pipelineField",
          path: `manifests.pipelines.${sourceId}`,
          value: source.sourceId,
        })
      }
    }
  }
}
