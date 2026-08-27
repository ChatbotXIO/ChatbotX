import { importTypes, uploadTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/** Percent-encoded path separators (`%2F`/`%5C`) S3 may decode into a real `/`. */
const ENCODED_PATH_SEPARATOR = /%2f|%5c/i

export const presignImportUploadRequest = z.object({
  type: uploadTypes,
  subType: z.union([
    importTypes,
    z.literal("file"),
    z.literal("generic"),
    // Ads-campaign creative image upload — see `uploadTypes.enum.adsCampaignCreative`
    // and `apps/builder/src/lib/upload/handlers.ts`.
    z.literal("adsCampaignCreative"),
  ]),
  workspaceId: zodBigintAsString().optional(),
  path: z
    .string()
    .min(1)
    .max(255)
    // Reject traversal, absolute paths, and PERCENT-ENCODED path separators
    // (`%2F`, `%5C`): S3 can decode them, letting a caller slip a key into a
    // privileged namespace that the literal, undecoded handler guards miss.
    .refine(
      (p) =>
        !(
          p.includes("..") ||
          p.startsWith("/") ||
          ENCODED_PATH_SEPARATOR.test(p)
        ),
      { message: "Invalid path" },
    )
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
