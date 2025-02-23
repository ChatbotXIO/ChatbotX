import { ActionType } from "@/features/flows/react-flow/action-type"
import { markEmailVerifiedBlockDefaultValue } from "@/features/flows/react-flow/blocks/mark-email-verified/schema"
import { openAIAnalyzeImageDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-analyze-image/schema"
import { openAIDeleteMessageHistoryDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-delete-message-history/schema"
import { openAIGenerateImageDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-generate-image/schema"
import { openAIGenerateTextAdvancedDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-generate-text-advanced/schema"
import { openAIGenerateTextAgentDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-generate-text-agent/schema"
import { openAIGenerateTextAssistantDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-generate-text-assistant/schema"
import { openAIGenerateTextDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-generate-text/schema"
import { openAISpeechToTextDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-speech-to-text/schema"
import { openAITextToSpeechDefaultValue } from "@/features/flows/react-flow/blocks/open-ai-text-to-speech/schema"
import { optInEmailBlockDefaultValue } from "@/features/flows/react-flow/blocks/opt-in-email/schema"
import { optOutEmailBlockDefaultValue } from "@/features/flows/react-flow/blocks/opt-out-email/schema"
import { sendAudioBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-audio/schema"
import { sendCardBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-card/schema"
import { sendCarouselBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-carousel/schema"
import { sendImageBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-image/schema"
import { sendTextBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-text/schema"
import { sendVideoBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-video/schema"

export const generateDefaultValue = (name: ActionType) => {
  switch (name) {
    case ActionType.SendText:
      return sendTextBlockDefaultValue()
    case ActionType.SendImage:
      return sendImageBlockDefaultValue()
    case ActionType.SendCard:
      return sendCardBlockDefaultValue()
    case ActionType.SendCarousel:
      return sendCarouselBlockDefaultValue(2)
    case ActionType.SendVideo:
      return sendVideoBlockDefaultValue()
    case ActionType.SendAudio:
      return sendAudioBlockDefaultValue()
    case ActionType.SendFile:
      return sendAudioBlockDefaultValue()

    // Action OpenAI
    case ActionType.OpenAIGenerateText:
      return openAIGenerateTextDefaultValue()
    case ActionType.OpenAIGenerateTextAgent:
      return openAIGenerateTextAgentDefaultValue()
    case ActionType.OpenAIGenerateTextAdvanced:
      return openAIGenerateTextAdvancedDefaultValue()
    case ActionType.OpenAIGenerateTextAssistant:
      return openAIGenerateTextAssistantDefaultValue()
    case ActionType.OpenAIGenerateImage:
      return openAIGenerateImageDefaultValue()
    case ActionType.OpenAIAnalyzeImage:
      return openAIAnalyzeImageDefaultValue()
    case ActionType.OpenAISpeechToText:
      return openAISpeechToTextDefaultValue()
    case ActionType.OpenAITextToSpeech:
      return openAITextToSpeechDefaultValue()
    case ActionType.OpenAIDeleteMessageHistory:
      return openAIDeleteMessageHistoryDefaultValue()

    // Email
    case ActionType.MarkEmailVerified:
      return markEmailVerifiedBlockDefaultValue()
    case ActionType.OptInEmail:
      return optInEmailBlockDefaultValue()
    case ActionType.OptOutEmail:
      return optOutEmailBlockDefaultValue()
    default:
      return null
  }
}
