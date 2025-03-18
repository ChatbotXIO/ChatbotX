import { ActionType } from "@/features/flows/react-flow/action-type"
import { markEmailVerifiedBlockDefaultFn } from "@/features/flows/react-flow/blocks/mark-email-verified/schema"
import { openAIAnalyzeImageDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-analyze-image/schema"
import { openAIDeleteMessageHistoryDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-delete-message-history/schema"
import { openAIGenerateImageDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-generate-image/schema"
import { openAIGenerateTextAdvancedDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-generate-text-advanced/schema"
import { openAIGenerateTextAgentDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-generate-text-agent/schema"
import { openAIGenerateTextAssistantDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-generate-text-assistant/schema"
import { openAIGenerateTextDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-generate-text/schema"
import { openAISpeechToTextDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-speech-to-text/schema"
import { openAITextToSpeechDefaultFn } from "@/features/flows/react-flow/blocks/open-ai-text-to-speech/schema"
import { optInEmailBlockDefaultFn } from "@/features/flows/react-flow/blocks/opt-in-email/schema"
import { optOutEmailBlockDefaultFn } from "@/features/flows/react-flow/blocks/opt-out-email/schema"
import { sendAudioBlockDefaultFn } from "@/features/flows/react-flow/blocks/send-audio/schema"
import { sendCardBlockDefaultFn } from "@/features/flows/react-flow/blocks/send-card/schema"
import { sendCarouselBlockDefaultFn } from "@/features/flows/react-flow/blocks/send-carousel/schema"
import { sendImageBlockDefaultFn } from "@/features/flows/react-flow/blocks/send-image/schema"
import { sendTextBlockDefaultFn } from "@/features/flows/react-flow/blocks/send-text/schema"
import { sendVideoBlockDefaultFn } from "@/features/flows/react-flow/blocks/send-video/schema"

export const generateDefaultFn = (name: ActionType) => {
  switch (name) {
    case ActionType.SendText:
      return sendTextBlockDefaultFn()
    case ActionType.SendImage:
      return sendImageBlockDefaultFn()
    case ActionType.SendCard:
      return sendCardBlockDefaultFn()
    case ActionType.SendCarousel:
      return sendCarouselBlockDefaultFn(2)
    case ActionType.SendVideo:
      return sendVideoBlockDefaultFn()
    case ActionType.SendAudio:
      return sendAudioBlockDefaultFn()
    case ActionType.SendFile:
      return sendAudioBlockDefaultFn()

    // Action OpenAI
    case ActionType.OpenAIGenerateText:
      return openAIGenerateTextDefaultFn()
    case ActionType.OpenAIGenerateTextAgent:
      return openAIGenerateTextAgentDefaultFn()
    case ActionType.OpenAIGenerateTextAdvanced:
      return openAIGenerateTextAdvancedDefaultFn()
    case ActionType.OpenAIGenerateTextAssistant:
      return openAIGenerateTextAssistantDefaultFn()
    case ActionType.OpenAIGenerateImage:
      return openAIGenerateImageDefaultFn()
    case ActionType.OpenAIAnalyzeImage:
      return openAIAnalyzeImageDefaultFn()
    case ActionType.OpenAISpeechToText:
      return openAISpeechToTextDefaultFn()
    case ActionType.OpenAITextToSpeech:
      return openAITextToSpeechDefaultFn()
    case ActionType.OpenAIDeleteMessageHistory:
      return openAIDeleteMessageHistoryDefaultFn()

    // Email
    case ActionType.MarkEmailVerified:
      return markEmailVerifiedBlockDefaultFn()
    case ActionType.OptInEmail:
      return optInEmailBlockDefaultFn()
    case ActionType.OptOutEmail:
      return optOutEmailBlockDefaultFn()
    default:
      return null
  }
}
