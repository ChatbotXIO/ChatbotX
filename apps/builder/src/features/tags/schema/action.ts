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

const UPDATE_TAG_EMPTY_MESSAGE =
  "Provide at least one of name, color or folderId to update."

/** An update that changes nothing has no column to write. */
const hasTagChange = (value: {
  name?: string
  color?: string | null
  folderId?: string | null
}): boolean =>
  value.name !== undefined ||
  value.color !== undefined ||
  value.folderId !== undefined

export const updateTagSchema = z
  .object({
    /** Omitted keeps the name (a color-only save, which a View-only copy allows). */
    name: z.string().trim().min(1).max(255).optional(),
    color: tagColorField,
  })
  .refine(hasTagChange, { message: UPDATE_TAG_EMPTY_MESSAGE })
export type UpdateTagSchema = z.input<typeof updateTagSchema>

/** Public create: the form's fields, with the folder worded for API callers. */
export const createTagPublicRequest = createTagRequest
  .pick({ name: true, color: true })
  .extend({
    folderId: zodBigintAsString()
      .nullish()
      .describe(
        'Folder id from `folders.list` (folderType "tag"). Pass null or "0" for the root.',
      ),
  })

/** Public update: every field optional (a color-only update is valid), at least one required. */
export const updateTagPublicRequest = createTagPublicRequest
  .partial({ name: true })
  .extend({
    id: zodBigintAsString().describe("Tag id. Get it from `tags.list`."),
  })
  .refine(hasTagChange, { message: UPDATE_TAG_EMPTY_MESSAGE })
