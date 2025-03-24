import { StepType } from "@/features/flows/react-flow/steps/step-action"
import { markEmailVerifiedStepDefaultFn } from "@/features/flows/react-flow/steps/mark-email-verified/schema"
import { openAIAnalyzeImageDefaultFn } from "@/features/flows/react-flow/steps/open-ai-analyze-image/schema"
import { openAIDeleteMessageHistoryDefaultFn } from "@/features/flows/react-flow/steps/open-ai-delete-message-history/schema"
import { openAIGenerateImageDefaultFn } from "@/features/flows/react-flow/steps/open-ai-generate-image/schema"
import { openAIGenerateTextAdvancedDefaultFn } from "@/features/flows/react-flow/steps/open-ai-generate-text-advanced/schema"
import { openAIGenerateTextAgentDefaultFn } from "@/features/flows/react-flow/steps/open-ai-generate-text-agent/schema"
import { openAIGenerateTextAssistantDefaultFn } from "@/features/flows/react-flow/steps/open-ai-generate-text-assistant/schema"
import { openAIGenerateTextDefaultFn } from "@/features/flows/react-flow/steps/open-ai-generate-text/schema"
import { openAISpeechToTextDefaultFn } from "@/features/flows/react-flow/steps/open-ai-speech-to-text/schema"
import { openAITextToSpeechDefaultFn } from "@/features/flows/react-flow/steps/open-ai-text-to-speech/schema"
import { optInEmailStepDefaultFn } from "@/features/flows/react-flow/steps/opt-in-email/schema"
import { optOutEmailStepDefaultFn } from "@/features/flows/react-flow/steps/opt-out-email/schema"
import { sendAudioStepDefaultFn } from "@/features/flows/react-flow/steps/send-audio/schema"
import { sendCardStepDefaultFn } from "@/features/flows/react-flow/steps/send-card/schema"
import { sendCarouselStepDefaultFn } from "@/features/flows/react-flow/steps/send-carousel/schema"
import { sendImageStepDefaultFn } from "@/features/flows/react-flow/steps/send-image/schema"
import { sendTextStepDefaultFn } from "@/features/flows/react-flow/steps/send-text/schema"
import { sendVideoStepDefaultFn } from "@/features/flows/react-flow/steps/send-video/schema"

export const generateDefaultFn = (name: StepType) => {
  switch (name) {
    case StepType.SendText:
      return sendTextStepDefaultFn()
    case StepType.SendImage:
      return sendImageStepDefaultFn()
    case StepType.SendCard:
      return sendCardStepDefaultFn()
    case StepType.SendCarousel:
      return sendCarouselStepDefaultFn(2)
    case StepType.SendVideo:
      return sendVideoStepDefaultFn()
    case StepType.SendAudio:
      return sendAudioStepDefaultFn()
    case StepType.SendFile:
      return sendAudioStepDefaultFn()

    // Action OpenAI
    case StepType.OpenAIGenerateText:
      return openAIGenerateTextDefaultFn()
    case StepType.OpenAIGenerateTextAgent:
      return openAIGenerateTextAgentDefaultFn()
    case StepType.OpenAIGenerateTextAdvanced:
      return openAIGenerateTextAdvancedDefaultFn()
    case StepType.OpenAIGenerateTextAssistant:
      return openAIGenerateTextAssistantDefaultFn()
    case StepType.OpenAIGenerateImage:
      return openAIGenerateImageDefaultFn()
    case StepType.OpenAIAnalyzeImage:
      return openAIAnalyzeImageDefaultFn()
    case StepType.OpenAISpeechToText:
      return openAISpeechToTextDefaultFn()
    case StepType.OpenAITextToSpeech:
      return openAITextToSpeechDefaultFn()
    case StepType.OpenAIDeleteMessageHistory:
      return openAIDeleteMessageHistoryDefaultFn()

    // Email
    case StepType.MarkEmailVerified:
      return markEmailVerifiedStepDefaultFn()
    case StepType.OptInEmail:
      return optInEmailStepDefaultFn()
    case StepType.OptOutEmail:
      return optOutEmailStepDefaultFn()
    default:
      return null
  }
}
