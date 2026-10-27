import type { TemplatePipelineManifestEntry } from "@chatbotx.io/flow-config"
import { pipelineTemplateService } from "../../../pipeline/pipeline-template.service"
import type { TemplateInstallContext } from "../types"

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
 * Find-or-create the pipelines flows depend on, matching by reference name
 * (stages by name, fields by reference name) via
 * `pipelineTemplateService.resolveTemplateEntry`, and fills `idMaps.pipeline`,
 * `idMaps.pipelineStage` and `idMaps.pipelineField` so the flows adapter never
 * leaves foreign ids behind. Provenance is recorded under the `flows` category
 * (the template category enum is a database enum; pipelines need no new one).
 */
export const resolvePipelineManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplatePipelineManifestEntry>>,
): Promise<void> => {
  for (const [sourceId, entry] of Object.entries(manifest)) {
    const resolved = await pipelineTemplateService.resolveTemplateEntry({
      tx: ctx.tx,
      workspaceId: ctx.workspaceId,
      entry,
    })
    ensureMap(ctx, "pipeline").set(sourceId, resolved.pipeline.id)
    ctx.track({
      category: "flows",
      resourceKind: "pipeline",
      resourceId: resolved.pipeline.id,
      sourceResourceId: sourceId,
      wasExisting: !resolved.created,
    })
    const stageMap = ensureMap(ctx, "pipelineStage")
    for (const [source, target] of resolved.stageIds) {
      stageMap.set(source, target)
    }
    const fieldMap = ensureMap(ctx, "pipelineField")
    for (const [source, target] of resolved.fieldIds) {
      fieldMap.set(source, target)
    }
    const unmatched = [
      ...resolved.unmatchedStages.map((value) => ({
        entityKind: "pipelineStage",
        value,
      })),
      ...resolved.unmatchedFields.map((value) => ({
        entityKind: "pipelineField",
        value,
      })),
    ]
    for (const { entityKind, value } of unmatched) {
      ctx.warn({
        category: "flows",
        entityKind,
        path: `manifests.pipelines.${sourceId}`,
        value,
      })
    }
  }
}
