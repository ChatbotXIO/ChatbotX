import { zodBigintAsString } from "@chatbotx.io/utils"
import { SAVED_REPLY_MAX_IMAGES } from "@chatbotx.io/utils/inbox-image-support"
import { z } from "zod"
import { savedReplyResource } from "./resource"

export const listSavedRepliesRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListSavedRepliesRequest = z.infer<typeof listSavedRepliesRequest>

const savedReplyFields = z.object({
  shortcut: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("Trigger text agents type to insert this reply."),
  text: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .describe(
      "Reply text to insert. May be empty when the reply has at least one image.",
    ),
  imageFileIds: z
    .array(zodBigintAsString())
    .max(SAVED_REPLY_MAX_IMAGES)
    .optional()
    .describe(
      "Ordered media library image ids attached to the reply (max 10). Get them from `mediaLibrary.listFiles` with `fileType=image`; only images are accepted.",
    ),
})

const hasTextOrImages = (input: z.infer<typeof savedReplyFields>) =>
  Boolean(input.text?.length) || (input.imageFileIds?.length ?? 0) > 0

const TEXT_OR_IMAGE_REQUIRED = "A saved reply needs text or at least one image"

/**
 * The create/edit forms always send both fields, so they check "text or an
 * image" on the client too — with the caller's translated `message`.
 */
export const buildSavedReplyFormSchema = (message: string) =>
  savedReplyFields.refine(hasTextOrImages, { message, path: ["text"] })

export const createSavedReplyRequest = buildSavedReplyFormSchema(
  TEXT_OR_IMAGE_REQUIRED,
)
export type CreateSavedReplyRequest = z.infer<typeof createSavedReplyRequest>

/**
 * No "text or an image" check here: an omitted field keeps its current
 * value, so only the service — which sees the stored reply — can tell
 * whether the result would be empty.
 */
export const editSavedReplyRequest = savedReplyFields.extend({
  text: savedReplyFields.shape.text.describe(
    "Reply text. Omit to keep the current text.",
  ),
  imageFileIds: savedReplyFields.shape.imageFileIds.describe(
    "Ordered media library image ids (max 10), from `mediaLibrary.listFiles` with `fileType=image`. Omit to keep the current images; pass `[]` to remove them all.",
  ),
})
export type EditSavedReplyRequest = z.infer<typeof editSavedReplyRequest>

export const deleteSavedReplyRequest = z.object({
  id: zodBigintAsString(),
})
export type DeleteSavedReplyRequest = z.infer<typeof deleteSavedReplyRequest>

export const listSavedReplyResponse = z.object({
  data: z.array(savedReplyResource),
})
export type ListSavedReplyResponse = z.infer<typeof listSavedReplyResponse>

export const publicListSavedReplyResponse = z.object({
  data: z.array(savedReplyResource),
  pageCount: z.number().int(),
})
