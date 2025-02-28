import { markEmailVerifiedBlockSchema } from "@/features/flows/react-flow/blocks/mark-email-verified/schema"
import { openAIAnalyzeImageSchema } from "@/features/flows/react-flow/blocks/open-ai-analyze-image/schema"
import { openAIDeleteMessageHistorySchema } from "@/features/flows/react-flow/blocks/open-ai-delete-message-history/schema"
import { openAIGenerateImageSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-image/schema"
import { openAIGenerateTextAdvancedSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-advanced/schema"
import { openAIGenerateTextAgentSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-agent/schema"
import { openAIGenerateTextAssistantSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text-assistant/schema"
import { openAIGenerateTextSchema } from "@/features/flows/react-flow/blocks/open-ai-generate-text/schema"
import { openAISpeechToTextSchema } from "@/features/flows/react-flow/blocks/open-ai-speech-to-text/schema"
import { openAITextToSpeechSchema } from "@/features/flows/react-flow/blocks/open-ai-text-to-speech/schema"
import { optInEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-in-email/schema"
import { optOutEmailBlockSchema } from "@/features/flows/react-flow/blocks/opt-out-email/schema"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export enum ButtonActionType {
  SendMessage = "SendMessage",
  OpenWebsite = "OpenWebsite",
  CallPhoneNumber = "CallPhoneNumber",
  PerformAction = "PerformAction",
  StartAnotherFlow = "StartAnotherFlow",
  StartAnotherStep = "StartAnotherStep",
  StartExternalStep = "StartExternalStep",
}

export const ButtonActionFlow = [
  ButtonActionType.SendMessage,
  ButtonActionType.PerformAction,
  ButtonActionType.StartAnotherFlow,
  ButtonActionType.StartAnotherStep,
]

export enum BrowserSize {
  Full = "100",
  Large = "70",
  Medium = "40",
}

export const buttonBlockSchema = z
  .object({
    id: z.string().cuid2(),
    label: z.string().min(1).max(100),
    actions: z.array(
      z.union([
        // Open AI
        openAIGenerateTextSchema,
        openAIGenerateTextAgentSchema,
        openAIGenerateTextAdvancedSchema,
        openAIGenerateTextAssistantSchema,
        openAIGenerateImageSchema,
        openAIAnalyzeImageSchema,
        openAISpeechToTextSchema,
        openAITextToSpeechSchema,
        openAIDeleteMessageHistorySchema,

        // Email
        markEmailVerifiedBlockSchema,
        optInEmailBlockSchema,
        optOutEmailBlockSchema,
      ]),
    ),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal(ButtonActionType.SendMessage),
      }),
      z.object({
        type: z.literal(ButtonActionType.OpenWebsite),
        url: z.string().url(),
        browserSize: z.nativeEnum(BrowserSize),
      }),
      z.object({
        type: z.literal(ButtonActionType.CallPhoneNumber),
        phoneNumber: z
          .string()
          .regex(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/),
      }),
      z.object({
        type: z.literal(ButtonActionType.PerformAction),
      }),
      z.object({
        type: z.literal(ButtonActionType.StartAnotherFlow),
      }),
      z.object({
        type: z.literal(ButtonActionType.StartAnotherStep),
      }),
      z.object({
        type: z.literal(ButtonActionType.StartExternalStep),
        stepId: z.string().min(1),
      }),
      z.object({
        type: z.literal(null),
      }),
    ]),
  )
export type ButtonBlockSchema = z.infer<typeof buttonBlockSchema>

export const buttonBlockDefaultValue = (label = ""): ButtonBlockSchema => ({
  id: createId(),
  label,
  type: null,
  actions: [],
})
