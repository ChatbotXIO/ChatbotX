import { z } from "zod"

/**
 * Every resource category a Template can bundle. Kept as a single source of
 * truth so the business-layer adapter registry can `satisfies
 * Record<TemplateCategory, ResourceAdapter>` and fail to compile if a
 * category is ever added here without a matching adapter.
 */
export const templateCategories = z.enum([
  "flows",
  "customFields",
  "tags",
  "products",
  "productCategories",
  "aiFunctions",
  "aiAgents",
  "calendars",
  "webchats",
  "keywords",
  "entryPointLinks",
  "triggers",
  "fbCommentAutomations",
  "settings",
])
export type TemplateCategory = z.infer<typeof templateCategories>

export const templateInstallationStatuses = z.enum([
  "pending",
  "installing",
  "completed",
  "partial",
  "failed",
])
export type TemplateInstallationStatus = z.infer<
  typeof templateInstallationStatuses
>

export const templateResourceSelectionSchema = z.union([
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("ids"), ids: z.array(z.string()) }),
])
export type TemplateResourceSelection = z.infer<
  typeof templateResourceSelectionSchema
>

export const templateSelectionSchema = z.partialRecord(
  templateCategories,
  templateResourceSelectionSchema,
)
export type TemplateSelection = z.infer<typeof templateSelectionSchema>

export const templateCategoryCountsSchema = z.record(
  templateCategories,
  z.number().int().nonnegative(),
)
export type TemplateCategoryCounts = z.infer<
  typeof templateCategoryCountsSchema
>

export const templatePermissionsSchema = z.object({
  allowEdit: z.boolean().default(true),
  allowDelete: z.boolean().default(true),
})
export type TemplatePermissions = z.infer<typeof templatePermissionsSchema>

export const templateWarningSchema = z.object({
  category: templateCategories,
  entityKind: z.string(),
  path: z.string(),
  value: z.string(),
})
export type TemplateWarning = z.infer<typeof templateWarningSchema>
