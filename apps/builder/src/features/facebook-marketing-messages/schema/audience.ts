import { z } from "zod"

export const AUDIENCE_ACCEPTED_EXTENSIONS = [".csv", ".txt", ".xlsx"] as const
export const AUDIENCE_ACCEPT_ATTRIBUTE = AUDIENCE_ACCEPTED_EXTENSIONS.join(",")
export const AUDIENCE_MAX_FILE_BYTES = 20 * 1024 * 1024
export const AUDIENCE_NAME_MAX = 100
export const AUDIENCE_DESCRIPTION_MAX = 500

/**
 * Lenient on purpose: browsers label a .csv as text/csv, application/vnd.ms-excel
 * (Windows + Excel) or nothing at all. The extension check is the primary gate;
 * this only rejects clearly wrong types (images, PDFs, ...).
 */
export const AUDIENCE_ALLOWED_MIME_TYPES: readonly string[] = [
  "",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/csv",
  "text/x-csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]

export const hasAcceptedExtension = (fileName: string) =>
  AUDIENCE_ACCEPTED_EXTENSIONS.some((extension) =>
    fileName.toLowerCase().endsWith(extension),
  )

const hasAcceptedMimeType = (mimeType: string) =>
  AUDIENCE_ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())

// Messages are i18n keys under facebookMarketingMessages.audiences.wizard.*;
// the client renders them through `t`.
export const audienceFileSchema = z
  .instanceof(File, { message: "fileRequired" })
  .refine((file) => file.size > 0, { message: "fileRequired" })
  .refine((file) => file.size <= AUDIENCE_MAX_FILE_BYTES, {
    message: "fileTooLarge",
  })
  .refine((file) => hasAcceptedExtension(file.name), { message: "fileType" })
  .refine((file) => hasAcceptedMimeType(file.type), { message: "fileType" })

export const createAudienceSchema = z.object({
  adAccountId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(AUDIENCE_NAME_MAX),
  description: z.string().trim().max(AUDIENCE_DESCRIPTION_MAX).optional(),
  file: audienceFileSchema,
})
export type CreateAudienceInput = z.infer<typeof createAudienceSchema>

export const uploadMoreAudienceSchema = z.object({
  id: z.string().trim().min(1),
  file: audienceFileSchema,
})
export type UploadMoreAudienceInput = z.infer<typeof uploadMoreAudienceSchema>

export const deleteAudienceSchema = z.object({ id: z.string().trim().min(1) })
