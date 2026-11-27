import type { TemplateCategory } from "@chatbotx.io/database/partials"
import type { TemplatePipelineManifestEntry } from "@chatbotx.io/flow-config"
import { pipelineTemplateService } from "../../../pipeline/pipeline-template.service"
import { idMapOf, recordCopy } from "../shared"
import type { TemplateInstallContext } from "../types"

/**
 * Find-or-creates one pipeline by reference name (stages by name, fields by
 * reference name), fills the three id maps, records the copy and warns about
 * what did not match. `pathPrefix` names where the entry sits in the payload.
 */
export const resolvePipelineEntry = async (
  ctx: TemplateInstallContext,
  sourceId: string,
  entry: TemplatePipelineManifestEntry,
  provenance: { category: TemplateCategory; pathPrefix: string },
): Promise<void> => {
  const resolved = await pipelineTemplateService.resolveTemplateEntry({
    tx: ctx.tx,
    workspaceId: ctx.workspaceId,
    entry,
  })
  const stageMap = idMapOf(ctx, "pipelineStage")
  for (const [source, target] of resolved.stageIds) {
    stageMap.set(source, target)
  }
  const fieldMap = idMapOf(ctx, "pipelineField")
  for (const [source, target] of resolved.fieldIds) {
    fieldMap.set(source, target)
  }
  recordCopy(ctx, {
    category: provenance.category,
    resourceKind: "pipeline",
    idMapKind: "pipeline",
    sourceId,
    resourceId: resolved.pipeline.id,
    wasExisting: !resolved.created,
  })
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
      category: provenance.category,
      entityKind,
      path: `${provenance.pathPrefix}.${sourceId}`,
      value,
    })
  }
}

/**
 * The pipelines flows depend on, so the flows adapter never leaves foreign ids
 * behind. Provenance is recorded under the `flows` category (the template
 * category enum is a database enum; pipelines need no new one).
 */
export const resolvePipelineManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplatePipelineManifestEntry>>,
): Promise<void> => {
  for (const [sourceId, entry] of Object.entries(manifest)) {
    await resolvePipelineEntry(ctx, sourceId, entry, {
      category: "flows",
      pathPrefix: "manifests.pipelines",
    })
  }
}
