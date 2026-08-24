import { customFieldTypes } from "@chatbotx.io/utils/custom-field"
import { z } from "zod"
import { flowExportedFlowSchema } from "./schema"

export const TEMPLATE_EXPORT_FORMAT_VERSION = 1

/**
 * `manifests` are *identity-resolved* at install time: each entry describes
 * a natural key the installer uses to find-or-create the row in the target
 * workspace, rather than always inserting a new one. Keyed by `sourceId` so
 * the remapper's `idMaps` can be built directly from
 * `Object.entries(manifest)`.
 */
export const templateCustomFieldManifestEntrySchema = z.object({
  name: z.string().trim().min(1),
  type: customFieldTypes,
})
export type TemplateCustomFieldManifestEntry = z.infer<
  typeof templateCustomFieldManifestEntrySchema
>

export const templateTagManifestEntrySchema = z.object({
  name: z.string().trim().min(1),
})
export type TemplateTagManifestEntry = z.infer<
  typeof templateTagManifestEntrySchema
>

export const templateProductCategoryManifestEntrySchema = z.object({
  name: z.string().trim().min(1),
  // Points at another entry's *sourceId* in this same manifest, so the
  // installer can resolve parents before children.
  parentSourceId: z.string().nullable(),
})
export type TemplateProductCategoryManifestEntry = z.infer<
  typeof templateProductCategoryManifestEntrySchema
>

/**
 * Folder manifest MUST key on `folderType`, not name alone — `AutomatedResponse`
 * (Keywords) is one table serving two `FolderType`s (`automatedResponse` for
 * inbound, `outboundAutomatedResponse` for outbound). A name-only key would
 * collapse the two namespaces and silently land inbound keywords in an
 * outbound folder. `parentSourceId` mirrors the product-category manifest so
 * nested folders resolve parent-first.
 */
export const templateFolderManifestEntrySchema = z.object({
  name: z.string().trim().min(1),
  folderType: z.string(),
  parentSourceId: z.string().nullable(),
})
export type TemplateFolderManifestEntry = z.infer<
  typeof templateFolderManifestEntrySchema
>

export const templateManifestsSchema = z.object({
  customFields: z
    .record(z.string(), templateCustomFieldManifestEntrySchema)
    .default({}),
  tags: z.record(z.string(), templateTagManifestEntrySchema).default({}),
  productCategories: z
    .record(z.string(), templateProductCategoryManifestEntrySchema)
    .default({}),
  folders: z.record(z.string(), templateFolderManifestEntrySchema).default({}),
})
export type TemplateManifests = z.infer<typeof templateManifestsSchema>

/**
 * `resources` are *always-created* on install, one array per category. Each
 * entry's own row shape is intentionally left as `z.record(z.string(),
 * z.unknown())` here — the per-category adapter (`packages/business/src/
 * template/adapters/*`) owns and validates its own row shape at insert time.
 * This envelope only guarantees every entry carries a `sourceId` join key,
 * which is all the generic remapper needs.
 */
const templateResourceEntrySchema = z
  .object({ sourceId: z.string() })
  .and(z.record(z.string(), z.unknown()))

export const templateFlowEntrySchema = z
  .object({
    sourceId: z.string(),
    // Points at a `manifests.folders` sourceId — resolved against
    // `idMaps.folder` at install time, same as any other manifest reference.
    folderId: z.string().nullable().optional(),
  })
  .and(flowExportedFlowSchema)
export type TemplateFlowEntry = z.infer<typeof templateFlowEntrySchema>

export const templateResourcesSchema = z.object({
  flows: z.array(templateFlowEntrySchema).default([]),
  products: z.array(templateResourceEntrySchema).default([]),
  aiFunctions: z.array(templateResourceEntrySchema).default([]),
  aiAgents: z.array(templateResourceEntrySchema).default([]),
  calendars: z.array(templateResourceEntrySchema).default([]),
  webchats: z.array(templateResourceEntrySchema).default([]),
  keywords: z.array(templateResourceEntrySchema).default([]),
  entryPointLinks: z.array(templateResourceEntrySchema).default([]),
  triggers: z.array(templateResourceEntrySchema).default([]),
  fbCommentAutomations: z.array(templateResourceEntrySchema).default([]),
  settings: z
    .object({
      savedReplies: z.array(templateResourceEntrySchema).default([]),
      botFields: z.array(templateResourceEntrySchema).default([]),
    })
    .default({ savedReplies: [], botFields: [] }),
})
export type TemplateResources = z.infer<typeof templateResourcesSchema>

export const templateExportSchema = z.object({
  formatVersion: z.literal(TEMPLATE_EXPORT_FORMAT_VERSION),
  exportedAt: z.string(),
  source: z.object({
    workspaceId: z.string(),
    tenantId: z.string(),
  }),
  manifests: templateManifestsSchema,
  resources: templateResourcesSchema,
})
export type TemplateExport = z.infer<typeof templateExportSchema>

export type TemplateExportParseResult =
  | { ok: true; data: TemplateExport }
  | { ok: false; reason: string }

/**
 * Mirrors `parseFlowExport`'s never-throws `{ok, data} | {ok, reason}`
 * contract with a version pre-check, run on every install (never trust a
 * stored jsonb blob across a format change).
 */
export const parseTemplateExport = (
  raw: unknown,
): TemplateExportParseResult => {
  const preParsed = z.object({ formatVersion: z.unknown() }).safeParse(raw)
  if (
    preParsed.success &&
    preParsed.data.formatVersion !== TEMPLATE_EXPORT_FORMAT_VERSION
  ) {
    return {
      ok: false,
      reason: `Unsupported template export format version: ${String(
        preParsed.data.formatVersion,
      )}`,
    }
  }

  const result = templateExportSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, reason: result.error.message }
  }
  return { ok: true, data: result.data }
}
