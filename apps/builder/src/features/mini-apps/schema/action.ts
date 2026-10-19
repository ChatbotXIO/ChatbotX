import {
  MINI_APP_NAME_MAX_LENGTH,
  miniAppDefinitionSchema,
} from "@chatbotx.io/mini-app"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/** Shared by the builder actions and the public API. */
export const miniAppName = z
  .string()
  .trim()
  .min(1)
  .max(MINI_APP_NAME_MAX_LENGTH)
  .describe(
    "Mini App name, unique within the workspace. Also used as the WhatsApp Flow name when published.",
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

/** The WhatsApp number a Mini App is published to. Shared by the builder actions and the public API. */
export const publishTargetWhatsappId = zodBigintAsString().describe(
  "WhatsApp number to publish to (the WhatsApp channel id). Get it from `whatsappChannels.list`.",
)

export const miniAppWhatsappRequest = z.object({
  integrationWhatsappId: publishTargetWhatsappId,
})
export type MiniAppWhatsappRequest = z.infer<typeof miniAppWhatsappRequest>

export const publishMiniAppWhatsappRequest = miniAppWhatsappRequest.extend({
  /** False saves the Flow on Meta as a draft instead of publishing it. */
  publish: z.boolean().default(true),
})
export type PublishMiniAppWhatsappRequest = z.infer<
  typeof publishMiniAppWhatsappRequest
>

const miniAppVisitorRequest = z.object({
  miniAppId: zodBigintAsString(),
  token: z.string().max(4096).optional(),
  answers: z.record(z.string(), z.unknown()),
  timezone: z.string().max(64).optional(),
})

export const submitMiniAppRequest = miniAppVisitorRequest.extend({
  /** Signed by an "Open Mini App" flow button: the flow to continue on submit. */
  resume: z.string().max(4096).optional(),
})
export type SubmitMiniAppRequest = z.infer<typeof submitMiniAppRequest>

export const saveMiniAppScreenRequest = miniAppVisitorRequest.extend({
  screenKey: z.string().min(1).max(64),
})
export type SaveMiniAppScreenRequest = z.infer<typeof saveMiniAppScreenRequest>

export const MINI_APP_BULK_DELETE_MAX_IDS = 100

export const deleteWhatsappFlowsField = z
  .boolean()
  .default(false)
  .describe(
    "Also remove the WhatsApp Flows the Mini Apps were published as. Meta deletes a draft Flow but cannot delete a published one, so a published Flow is deprecated instead (it can no longer be sent). Defaults to false: the Flows stay on Meta.",
  )

export const deleteMiniAppsRequest = z.object({
  ids: z
    .array(zodBigintAsString())
    .max(MINI_APP_BULK_DELETE_MAX_IDS)
    .describe("Ids of the Mini Apps to delete."),
  deleteWhatsappFlows: deleteWhatsappFlowsField,
})
export type DeleteMiniAppsRequest = z.input<typeof deleteMiniAppsRequest>
