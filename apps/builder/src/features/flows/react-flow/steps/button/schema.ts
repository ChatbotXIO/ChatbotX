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
import { markEmailVerifiedStep } from "../mark-email-verified"
import { openAIAnalyzeImageStep } from "../open-ai-analyze-image"
import { openAIDeleteMessageHistoryStep } from "../open-ai-delete-message-history"
import { openAIGenerateImageStep } from "../open-ai-generate-image"
import { openAIGenerateTextStep } from "../open-ai-generate-text"
import { openAIGenerateTextAdvancedStep } from "../open-ai-generate-text-advanced"
import { openAIGenerateTextAgentStep } from "../open-ai-generate-text-agent"
import { openAIGenerateTextAssistantStep } from "../open-ai-generate-text-assistant"
import { openAISpeechToTextStep } from "../open-ai-speech-to-text"
import { openAITextToSpeechStep } from "../open-ai-text-to-speech"
import { optInEmailStep } from "../opt-in-email"
import { optOutEmailStep } from "../opt-out-email"
import performActionStep from "../perform-action"
import sendMessageNodeStep from "../send-message-node"

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
        openAIGenerateTextStep.validator,
        openAIGenerateTextAgentStep.validator,
        openAIGenerateTextAdvancedStep.validator,
        openAIGenerateTextAssistantStep.validator,
        openAIGenerateImageStep.validator,
        openAIAnalyzeImageStep.validator,
        openAISpeechToTextStep.validator,
        openAITextToSpeechStep.validator,
        openAIDeleteMessageHistoryStep.validator,

        // Email
        markEmailVerifiedStep.validator,
        optInEmailStep.validator,
        optOutEmailStep.validator,
      ]),
    ),
  })
  .and(
    z.discriminatedUnion("buttonType", [
      z.object({
        buttonType: z.literal(ButtonType.SendMessage),
        steps: z.array(
          z.union([sendMessageNodeStep.validator, performActionStep.validator]),
        ),
      }),
      z.object({
        buttonType: z.literal(ButtonType.OpenWebsite),
        // url: z.string().url(),
        // browserSize: z.nativeEnum(BrowserSize),
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
