import { zodBigintAsString } from "@chatbotx.io/utils"
import { hexColorSchema } from "@chatbotx.io/utils/color"
import { z } from "zod"
import { tagResource } from "./resource"

/** Omitted keeps the current color on update; null clears it. */
export const tagColorField = hexColorSchema
  .nullable()
  .optional()
  .describe(
    "Tag color as `#RRGGBB` (no alpha). Omit to leave it unchanged, or pass null to clear it.",
  )

export const createTagRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe(
      "Tag label, 1-255 characters. Must be unique within the workspace, so call `tags.list` first to reuse an existing tag.",
    ),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the tag in, or null for root-level."),
  color: tagColorField,
})
export type CreateTagRequest = z.input<typeof createTagRequest>

export const createTagResponse = z.object({
  data: tagResource,
})
export type CreateTagResponse = z.infer<typeof createTagResponse>

export const updateTagSchema = z.object({
  /** Omitted keeps the name (a color-only save, which a View-only copy allows). */
  name: z.string().trim().min(1).max(255).optional(),
  color: tagColorField,
})
export type UpdateTagSchema = z.input<typeof updateTagSchema>
