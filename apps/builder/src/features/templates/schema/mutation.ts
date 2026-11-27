import {
  templatePermissionsSchema,
  templateSelectionSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  EMBEDDED_VIDEO_SOURCE_MAX_LENGTH,
  YOUTUBE_VIDEO_ID_FORMAT,
} from "@chatbotx.io/utils/embedded-video"
import { z } from "zod"
import {
  idempotencyKeySchema,
  inboxBindingsSchema,
  shareTokenSchema,
} from "./shared"

const optionalUrl = z
  .union([
    z.literal("").transform(() => null),
    z.url({ protocol: /^https?$/ }),
    z.null(),
  ])
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

// The deprecated alias takes only a bare YouTube id (`YOUTUBE_VIDEO_ID_FORMAT`).
// Kept validated here because it is the one input that skips the provider
// parser. A blank value clears, like `optionalText`.
const optionalYoutubeVideoId = z
  .union([
    z.literal("").transform(() => null),
    z.string().trim().regex(YOUTUBE_VIDEO_ID_FORMAT),
    z.null(),
  ])
  .optional()

// A provider link or embed code. Only length and blankness are checked here:
// which provider and whether it parses is the business service's job (it
// answers with a validation error), so the rules live in one place. A blank
// `source` means "no video" (`null`), so an empty form field never errors.
// `.optional()` keeps an omitted `video` omitted (leave unchanged), as opposed
// to `null` (clear).
const optionalVideo = z
  .union([
    z
      .object({
        source: z.string().max(EMBEDDED_VIDEO_SOURCE_MAX_LENGTH),
      })
      .transform(({ source }) => (source.trim() === "" ? null : { source })),
    z.null(),
  ])
  .optional()

export const saveTemplateRequest = z.object({
  templateId: zodBigintAsString().optional(),
  name: z.string().trim().min(1).max(255),
  description: optionalText(2000),
  imageUrl: optionalPath,
  publisherName: optionalText(255),
  video: optionalVideo,
  youtubeVideoId: optionalYoutubeVideoId,
  testLink: optionalUrl,
  selection: templateSelectionSchema,
  defaultPermissions: templatePermissionsSchema,
  createInstallFolder: z.boolean(),
  defaultAutoUpdate: z.boolean(),
})

export const updateShareSettingsRequest = z.object({
  templateId: zodBigintAsString(),
  shareEnabled: z.boolean(),
  shareExpiresAt: z.string().datetime().nullable().optional(),
})

export const installTemplateRequest = z.object({
  shareToken: shareTokenSchema,
  allowDuplicate: z.boolean().optional(),
  autoUpdate: z.boolean().optional(),
  acceptPublisherUninstall: z.boolean().optional(),
  inboxBindings: inboxBindingsSchema.optional(),
  /** A client-generated key: a replayed reinstall returns the same sync. */
  idempotencyKey: idempotencyKeySchema.optional(),
})

export const syncInstallationRequest = z.object({
  idempotencyKey: idempotencyKeySchema.optional(),
})
