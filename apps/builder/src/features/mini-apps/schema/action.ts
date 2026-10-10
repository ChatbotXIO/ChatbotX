import { miniAppDefinitionSchema } from "@chatbotx.io/mini-app"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const MINI_APP_NAME_MAX_LENGTH = 100

const miniAppName = z
  .string()
  .trim()
  .min(1)
  .max(MINI_APP_NAME_MAX_LENGTH)
  .describe(
    "Mini App name, unique within the workspace. Also used as the WhatsApp Flow name.",
  )

// The builder creates a Mini App from its name alone; the editor opens on a
// starter screen.
export const createMiniAppRequest = z.object({
  name: miniAppName,
})
export type CreateMiniAppRequest = z.infer<typeof createMiniAppRequest>

export const updateMiniAppRequest = z.object({
  name: miniAppName.optional(),
  enabled: z
    .boolean()
    .optional()
    .describe("Disabled Mini Apps cannot be opened from their public link."),
  definition: miniAppDefinitionSchema.optional(),
})
export type UpdateMiniAppRequest = z.infer<typeof updateMiniAppRequest>

export const publishMiniAppWhatsappRequest = z.object({
  integrationWhatsappId: zodBigintAsString().describe(
    "WhatsApp number to publish to (the WhatsApp channel id). Get it from `whatsappChannels.list`.",
  ),
})
export type PublishMiniAppWhatsappRequest = z.infer<
  typeof publishMiniAppWhatsappRequest
>

export const submitMiniAppRequest = z.object({
  miniAppId: zodBigintAsString(),
  token: z.string().max(4096).optional(),
  answers: z.record(z.string(), z.unknown()),
  timezone: z.string().max(64).optional(),
})
export type SubmitMiniAppRequest = z.infer<typeof submitMiniAppRequest>
