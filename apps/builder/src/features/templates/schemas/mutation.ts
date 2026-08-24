import {
  templatePermissionsSchema,
  templateSelectionSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const optionalUrl = z
  .union([z.literal("").transform(() => null), z.url(), z.null()])
  .optional()

const optionalText = (max: number) =>
  z
    .union([
      z.literal("").transform(() => null),
      z.string().trim().max(max),
      z.null(),
    ])
    .optional()

const optionalPath = optionalText(500)

export const saveTemplateRequest = z.object({
  templateId: zodBigintAsString().optional(),
  name: z.string().trim().min(1).max(255),
  description: optionalText(2000),
  imageUrl: optionalPath,
  publisherName: optionalText(255),
  youtubeVideoId: optionalText(64),
  testLink: optionalUrl,
  selection: templateSelectionSchema,
  defaultPermissions: templatePermissionsSchema,
  createInstallFolder: z.boolean(),
  defaultAutoUpdate: z.boolean(),
})
export type SaveTemplateRequest = z.infer<typeof saveTemplateRequest>

export const deleteTemplateRequest = z.object({
  templateId: zodBigintAsString(),
})

export const updateShareSettingsRequest = z.object({
  templateId: zodBigintAsString(),
  shareEnabled: z.boolean(),
  shareExpiresAt: z.string().datetime().nullable().optional(),
})

export const installTemplateRequest = z.object({
  shareToken: z.string().trim().min(1),
})
