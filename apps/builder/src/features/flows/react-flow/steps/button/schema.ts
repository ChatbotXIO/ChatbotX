import { markEmailVerifiedStepSchema } from "@/features/flows/react-flow/steps/mark-email-verified/schema"
import { openAIAnalyzeImageSchema } from "@/features/flows/react-flow/steps/open-ai-analyze-image/schema"
import { openAIDeleteMessageHistorySchema } from "@/features/flows/react-flow/steps/open-ai-delete-message-history/schema"
import { openAIGenerateImageSchema } from "@/features/flows/react-flow/steps/open-ai-generate-image/schema"
import { openAIGenerateTextAdvancedSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text-advanced/schema"
import { openAIGenerateTextAgentSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text-agent/schema"
import { openAIGenerateTextAssistantSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text-assistant/schema"
import { openAIGenerateTextSchema } from "@/features/flows/react-flow/steps/open-ai-generate-text/schema"
import { openAISpeechToTextSchema } from "@/features/flows/react-flow/steps/open-ai-speech-to-text/schema"
import { openAITextToSpeechSchema } from "@/features/flows/react-flow/steps/open-ai-text-to-speech/schema"
import { optInEmailStepSchema } from "@/features/flows/react-flow/steps/opt-in-email/schema"
import { optOutEmailStepSchema } from "@/features/flows/react-flow/steps/opt-out-email/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  LinkIcon,
  type LucideIcon,
  MessageCircleIcon,
  SkipForwardIcon,
  SquareArrowOutUpRight,
  ZapIcon,
} from "lucide-react"
import { z } from "zod"

export enum ButtonType {
  SendMessage = "SendMessage",
  OpenWebsite = "OpenWebsite",
  // CallPhoneNumber = "CallPhoneNumber",
  PerformAction = "PerformAction",
  StartAnotherFlow = "StartAnotherFlow",
  StartAnotherStep = "StartAnotherStep",
  StartExternalStep = "StartExternalStep",
}

export interface IButtonConfig {
  icon: LucideIcon
  label: string
  buttonType: ButtonType
}

export const allButtonsConfig: IButtonConfig[] = [
  {
    buttonType: ButtonType.SendMessage,
    icon: MessageCircleIcon,
    label: "Send Message",
  },
  {
    buttonType: ButtonType.OpenWebsite,
    icon: LinkIcon,
    label: "Open Website",
  },
  // {
  // buttonType: ButtonType.CallPhoneNumber,
  //   icon: "phone",
  //   label: "Call Phone Number"
  // },
  {
    buttonType: ButtonType.PerformAction,
    icon: ZapIcon,
    label: "Perform Action",
  },
  {
    buttonType: ButtonType.StartAnotherFlow,
    icon: SquareArrowOutUpRight,
    label: "Start Another Flow",
  },
  {
    buttonType: ButtonType.StartAnotherStep,
    icon: SkipForwardIcon,
    label: "Start Another Step",
  },
  {
    buttonType: ButtonType.StartExternalStep,
    icon: SquareArrowOutUpRight,
    label: "Start External Step",
  },
]

export enum BrowserSize {
  Full = "100",
  Large = "70",
  Medium = "40",
}

export const buttonStepSchema = z
  .object({
    id: z.string().cuid2(),
    label: z.string().min(1).max(100),
    steps: z.array(
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
        markEmailVerifiedStepSchema,
        optInEmailStepSchema,
        optOutEmailStepSchema,
      ]),
    ),
  })
  .and(
    z.discriminatedUnion("buttonType", [
      z.object({
        buttonType: z.literal(ButtonType.SendMessage),
      }),
      z.object({
        buttonType: z.literal(ButtonType.OpenWebsite),
        url: z.string().url(),
        browserSize: z.nativeEnum(BrowserSize),
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
        stepId: z.string().min(1),
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
