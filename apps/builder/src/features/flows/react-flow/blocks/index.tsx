import { ActionType } from "../action-type"
import type { JSX } from "react"
import type { ZodTypeAny } from "zod"
import { openAIGenerateImageBlock } from "./open-ai-generate-image"
import { markEmailVerifiedBlock } from "./mark-email-verified"
import { openAIAnalyzeImageBlock } from "./open-ai-analyze-image"
import { sendTextBlock } from "./send-text"
import { sendImageBlock } from "./send-image"
import { sendCardBlock } from "./send-card"
import { sendVideoBlock } from "./send-video"
import { sendAudioBlock } from "./send-audio"
import { sendCarouselBlock } from "./send-carousel"
import { sendAIGenerateTextBlock } from "./open-ai-generate-text"
import { openAIGenerateTextAgentBlock } from "./open-ai-generate-text-agent"
import { openAIGenerateTextAdvancedBlock } from "./open-ai-generate-text-advanced"
import { openAIGenerateTextAssistantBlock } from "./open-ai-generate-text-assistant"
import { openAISpeechToTextBlock } from "./open-ai-speech-to-text"
import { openAITextToSpeechBlock } from "./open-ai-text-to-speech"
import { openAIDeleteMessageHistoryBlock } from "./open-ai-delete-message-history"
import { optInEmailBlock } from "./opt-in-email"
import { optOutEmailBlock } from "./opt-out-email"
import { waitBlock } from "./wait"

interface EditorBlockProps {
  parentName: string
}

export interface DefaultFnProps {
  labelVersion: string
  position?: { x: number; y: number }
}

export interface BlockDefinition {
  editor: (props: EditorBlockProps) => JSX.Element
  viewer: (props: any) => JSX.Element
  schema: ZodTypeAny
  defaultValue: (any) => any
}

export const allBlocks: Record<ActionType, BlockDefinition | undefined> = {
  [ActionType.SendText]: sendTextBlock,
  [ActionType.SendImage]: sendImageBlock,
  [ActionType.SendCard]: sendCardBlock,
  [ActionType.SendVideo]: sendVideoBlock,
  [ActionType.SendAudio]: sendAudioBlock,
  [ActionType.SendCarousel]: sendCarouselBlock,
  [ActionType.OpenAIGenerateText]: sendAIGenerateTextBlock,
  [ActionType.OpenAIGenerateTextAgent]: openAIGenerateTextAgentBlock,
  [ActionType.OpenAIGenerateTextAdvanced]: openAIGenerateTextAdvancedBlock,
  [ActionType.OpenAIGenerateTextAssistant]: openAIGenerateTextAssistantBlock,
  [ActionType.OpenAIGenerateImage]: openAIGenerateImageBlock,
  [ActionType.OpenAIAnalyzeImage]: openAIAnalyzeImageBlock,
  [ActionType.OpenAISpeechToText]: openAISpeechToTextBlock,
  [ActionType.OpenAITextToSpeech]: openAITextToSpeechBlock,
  [ActionType.OpenAIDeleteMessageHistory]: openAIDeleteMessageHistoryBlock,
  [ActionType.MarkEmailVerified]: markEmailVerifiedBlock,
  [ActionType.OptInEmail]: optInEmailBlock,
  [ActionType.OptOutEmail]: optOutEmailBlock,
  [ActionType.SendMessage]: undefined,
  [ActionType.StartFlow]: undefined,
  [ActionType.Actions]: undefined,
  [ActionType.Condition]: undefined,
  [ActionType.SendMail]: undefined,
  [ActionType.SplitTraffic]: undefined,
  [ActionType.Wait]: waitBlock,
  [ActionType.LandingPage]: undefined,
  [ActionType.UserInput]: undefined,
  [ActionType.SendGif]: undefined,
  [ActionType.SetDebounce]: undefined,
  [ActionType.SendMessengerOtn]: undefined,
  [ActionType.SendFile]: undefined,
  [ActionType.AddTag]: undefined,
  [ActionType.RemoveTag]: undefined,
  [ActionType.NotifyAgent]: undefined,
  [ActionType.AddCustomField]: undefined,
  [ActionType.RemoveCustomField]: undefined,
  [ActionType.AddCustomLog]: undefined,
  [ActionType.SubscribeBot]: undefined,
  [ActionType.UnsubscribeBot]: undefined,
  [ActionType.RemoveContact]: undefined,
  [ActionType.CallApi]: undefined,
  [ActionType.InboxActions]: undefined,
  [ActionType.DisableBot]: undefined,
  [ActionType.EnableBot]: undefined,
  [ActionType.AssignConversation]: undefined,
  [ActionType.AutoAssignConversation]: undefined,
  [ActionType.UnassignConversation]: undefined,
  [ActionType.AddNote]: undefined,
  [ActionType.FollowConversation]: undefined,
  [ActionType.UnfollowConversation]: undefined,
  [ActionType.ArchiveConversation]: undefined,
  [ActionType.UnarchiveConversation]: undefined,
  [ActionType.BlockContact]: undefined,
  [ActionType.OpenAIActions]: undefined,
  [ActionType.EmailActions]: undefined,
  [ActionType.AddTrigger]: undefined,
  [ActionType.TriggerMake]: undefined,
  [ActionType.TriggerPabbly]: undefined,
  [ActionType.TriggerZapier]: undefined,
  [ActionType.MessengerActions]: undefined,
  [ActionType.AddMessengerCustomAudience]: undefined,
  [ActionType.AddMessengerRichmenu]: undefined,
  [ActionType.Others]: undefined,
  [ActionType.StartAnotherFlow]: undefined,
  [ActionType.StartAnotherStep]: undefined,
  [ActionType.StartExternalStep]: undefined,
  [ActionType.CancelContactInput]: undefined,
  [ActionType.Tools]: undefined,
  [ActionType.GetDataFromJson]: undefined,
  [ActionType.FormatDate]: undefined,
  [ActionType.RandomCode]: undefined,
  [ActionType.CountCharacters]: undefined,
}

export function DynamicBlockEditor({
  type,
  parentName,
  ...props
}: {
  type: ActionType
  parentName: string
}) {
  const Element = allBlocks[type]?.editor

  return Element ? <Element parentName={parentName} {...props} /> : null
}

export function DynamicBlockViewer({
  type,
  data,
  ...props
}: {
  type: ActionType
  data: any
}) {
  const Element = allBlocks[type]?.viewer

  return Element ? <Element data={data} {...props} /> : null
}
