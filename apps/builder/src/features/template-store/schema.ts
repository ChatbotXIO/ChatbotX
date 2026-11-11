import {
  TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH,
  TEMPLATE_STORE_MAX_CATEGORIES,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/** Whose store an admin screen manages. The server derives the tenant from it; it is never sent. */
export const templateStoreScopes = z.enum(["platform", "tenant"])
export type TemplateStoreScope = z.infer<typeof templateStoreScopes>

/** Any number of categories, including none: such a template shows under "All" only. */
const categoryIdsSchema = z
  .array(zodBigintIdAsString())
  .max(TEMPLATE_STORE_MAX_CATEGORIES)

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH)

export const searchTemplateStoreCandidatesSchema = z.object({
  scope: templateStoreScopes,
  keyword: z.string().trim().max(100).optional(),
})

export const addTemplateStoreListingSchema = z.object({
  scope: templateStoreScopes,
  templateId: zodBigintIdAsString(),
  categoryIds: categoryIdsSchema,
})
export type AddTemplateStoreListingSchema = z.infer<
  typeof addTemplateStoreListingSchema
>

export const updateTemplateStoreListingSchema = z.object({
  scope: templateStoreScopes,
  listingId: zodBigintIdAsString(),
  categoryIds: categoryIdsSchema,
})

export const removeTemplateStoreListingSchema = z.object({
  scope: templateStoreScopes,
  listingId: zodBigintIdAsString(),
})

export const createTemplateStoreCategorySchema = z.object({
  scope: templateStoreScopes,
  name: categoryNameSchema,
})

export const renameTemplateStoreCategorySchema = z.object({
  scope: templateStoreScopes,
  categoryId: zodBigintIdAsString(),
  name: categoryNameSchema,
})

export const moveTemplateStoreCategorySchema = z.object({
  scope: templateStoreScopes,
  categoryId: zodBigintIdAsString(),
  direction: z.enum(["up", "down"]),
})

export const deleteTemplateStoreCategorySchema = z.object({
  scope: templateStoreScopes,
  categoryId: zodBigintIdAsString(),
})

/** The refusals the UI explains in its own words; each maps to `templateStore.errors.<reason>`. */
export const templateStoreRejections = z.enum([
  "templateUnavailable",
  "listingExists",
  "listingUnavailable",
  "listingLimit",
  "categoryUnavailable",
  "categoryNameTaken",
  "categoryLimit",
])
export type TemplateStoreRejection = z.infer<typeof templateStoreRejections>

export type TemplateStoreOutcome =
  | { status: "done" }
  | { status: "rejected"; reason: TemplateStoreRejection }
