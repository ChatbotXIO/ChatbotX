import { zodBigintAsString, zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const STORE_KEYWORD_MAX_LENGTH = 100

export const listTemplateStorePublicRequest = z.object({
  categoryId: zodBigintIdAsString()
    .optional()
    .describe(
      "Only templates in this category. Use an `id` from `categories` of this same response; an unknown id returns no templates.",
    ),
  keyword: z
    .string()
    .trim()
    .max(STORE_KEYWORD_MAX_LENGTH)
    .optional()
    .describe("Only templates whose name or publisher contains this text."),
})

const storeCategoryResource = z.object({
  id: zodBigintAsString(),
  name: z.string(),
})

const storeTemplateResource = z.object({
  templateId: zodBigintAsString(),
  name: z.string(),
  description: z.string().nullable(),
  publisherName: z.string().nullable(),
  imageUrl: z
    .string()
    .describe("The template's cover, or the store's icon when it has none."),
  categoryIds: z
    .array(zodBigintAsString())
    .describe("Every category the template is in; empty when it has none."),
  shareToken: z
    .string()
    .describe(
      "The key of the share link. Pass it as `id` to `templatePreviews.get` and as `shareToken` to `templateInstallations.install`.",
    ),
  shareUrl: z.string().describe("The template's public page, ready to open."),
})

export const publicTemplateStoreResponse = z.object({
  categories: z
    .array(storeCategoryResource)
    .describe(
      "The store's categories that have at least one template, in tab order.",
    ),
  templates: z
    .array(storeTemplateResource)
    .describe("Templates anyone can open and install, newest first."),
})
