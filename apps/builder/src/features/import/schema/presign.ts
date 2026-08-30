import { importTypes, uploadTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const presignImportUploadRequest = z.object({
  type: uploadTypes,
  subType: z.union([importTypes, z.literal("file"), z.literal("generic")]),
  workspaceId: zodBigintAsString().optional(),
  path: z
    .string()
    .min(1)
    .max(255)
    .refine((p) => !(p.includes("..") || p.startsWith("/")), {
      message: "Invalid path",
    })
    .optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
})
export type PresignImportUploadRequest = z.infer<
  typeof presignImportUploadRequest
>

export const presignImportUploadResponse = z.object({
  fileId: zodBigintAsString(),
  presignedPostUrl: z.string().url(),
  publicUrl: z.string().url(),
  path: z.string(),
})
export type PresignImportUploadResponse = z.infer<
  typeof presignImportUploadResponse
>
