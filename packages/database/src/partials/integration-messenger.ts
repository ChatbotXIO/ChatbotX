import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "./shared"

export const messengerPersistentMenuTypes = z.enum(["flow", "url"])

export const messengerPersistentMenuSchema = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1).describe("Button text shown to the user."),
    type: z
      .literal(messengerPersistentMenuTypes.enum.flow)
      .describe("Item action: `flow` runs a flow when tapped."),
    flowId: zodBigintAsString().describe(
      "Flow to run when the item is tapped. Get it from `flows.list`.",
    ),
  }),
  z.object({
    label: z.string().min(1).describe("Button text shown to the user."),
    type: z
      .literal(messengerPersistentMenuTypes.enum.url)
      .describe("Item action: `url` opens a web link when tapped."),
    url: z.url().describe("Absolute URL to open (https recommended)."),
  }),
])
export type MessengerPersistentMenu = z.infer<
  typeof messengerPersistentMenuSchema
>

export const messengerPersonaSchema = z.object({
  // Stable local id (createId). Referenced by the "Set Persona" flow step and
  // stored on ContactInbox.personaId. Stays constant across edits, unlike the
  // Facebook persona id which is recreated whenever the persona changes.
  id: z.string(),
  // Facebook persona id, populated after the persona is registered with Facebook
  // on save. Empty until then; a renamed/re-pictured persona gets a new one.
  facebookPersonaId: z.string().optional(),
  isDefault: z.boolean(),
  name: z.string(),
  profilePicture: z.object({
    id: zodBigintAsString(),
    url: z.url(),
    mode: uploadModes,
  }),
})
export type MessengerPersona = z.infer<typeof messengerPersonaSchema>

export const messengerConversationStarterSchema = z.object({
  question: z.string(),
  flowId: zodBigintAsString(),
})
export type MessengerConversationStarter = z.infer<
  typeof messengerConversationStarterSchema
>

export const messengerTemplateStatusSchema = z.enum([
  "APPROVED",
  "PENDING",
  "REJECTED",
])
export type MessengerTemplateStatus = z.infer<
  typeof messengerTemplateStatusSchema
>

export const messengerTemplateParameterFormatSchema = z.enum([
  "POSITIONAL",
  "NAMED",
])
export type MessengerTemplateParameterFormat = z.infer<
  typeof messengerTemplateParameterFormatSchema
>
