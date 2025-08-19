import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { openWebsiteStepSchema } from "./open-website"
import { performActionStepSchema } from "./perform-action"
import { sendFlowNodeStepSchema } from "./send-flow-node"

export const ButtonType = {
  SendMessage: "SendMessage",
  OPEN_WEBSITE: "OPEN_WEBSITE",
  PerformAction: "PerformAction",
  StartAnotherFlow: "StartAnotherFlow",
  StartAnotherStep: "StartAnotherStep",
  StartExternalStep: "StartExternalStep",
} as const

export type ButtonType = (typeof ButtonType)[keyof typeof ButtonType]

export const BrowserSize = {
  Full: "100",
  Large: "70",
  Medium: "40",
} as const

export const buttonStepSchema = z
  .object({
    id: z.string().cuid2(),
    label: z.string().min(1).max(100),
    steps: z.array(z.any()),
    //   z.union([
    //     // Open AI
    //     openAIGenerateTextSchema,
    //     openAIGenerateTextAgentSchema,
    //     openAIGenerateTextAdvancedSchema,
    //     openAIGenerateTextAssistantSchema,
    //     openAIGenerateImageSchema,
    //     openAIAnalyzeImageSchema,
    //     openAISpeechToTextSchema,
    //     openAITextToSpeechSchema,
    //     openAIDeleteMessageHistorySchema,

    //     // Email
    //     markEmailVerifiedStepSchema,
    //     optInEmailStepSchema,
    //     optOutEmailStepSchema,
    //   ]),
    // ),
  })
  .and(
    z.discriminatedUnion("buttonType", [
      z.object({
        buttonType: z.literal(ButtonType.SendMessage),
        steps: z.array(
          z.union([sendFlowNodeStepSchema, performActionStepSchema]),
        ),
      }),
      z.object({
        buttonType: z.literal(ButtonType.OPEN_WEBSITE),
        steps: z.array(
          z.union([openWebsiteStepSchema, performActionStepSchema]),
        ),
      }),
      // z.object({
      //   type: z.literal(ButtonType.CallPhoneNumber),
      //   phoneNumber: z
      //     .string()
      //     .regex(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/),
      // }),
      z.object({
        buttonType: z.literal(ButtonType.PerformAction),
      }),
      z.object({
        buttonType: z.literal(ButtonType.StartAnotherFlow),
      }),
      z.object({
        buttonType: z.literal(ButtonType.StartAnotherStep),
      }),
      z.object({
        buttonType: z.literal(ButtonType.StartExternalStep),
        // stepId: z.string().min(1),
      }),
      z.object({
        buttonType: z.literal(null),
      }),
    ]),
  )
export type ButtonStepSchema = z.infer<typeof buttonStepSchema>

export const buttonStepDefaultFn = (label = ""): ButtonStepSchema => ({
  id: createId(),
  label,
  buttonType: null,
  steps: [],
})
