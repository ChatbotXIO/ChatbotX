import { StepType } from "./step-action"
import type { JSX } from "react"
import type { ZodTypeAny } from "zod"
import sendTextStep from "./send-text"
import sendImageStep from "./send-image"

interface StepEditorProps {
  parentName: string
}

export interface DefaultFnProps {
  labelVersion: string
  position?: { x: number; y: number }
}

export interface StepDefinition {
  editor: (props: StepEditorProps) => JSX.Element
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  viewer: (props: any) => JSX.Element
  validator: ZodTypeAny
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  defaultFn: () => any
}

export const allSteps: Record<StepType, StepDefinition | undefined> = {
  [StepType.SendText]: sendTextStep,
  [StepType.SendImage]: sendImageStep,
  [StepType.SendCard]: undefined,
  [StepType.SendCarousel]: undefined,
  [StepType.UserInput]: undefined,
  [StepType.SendVideo]: undefined,
  [StepType.SendGif]: undefined,
  [StepType.SetDebounce]: undefined,
  [StepType.SendMessengerOtn]: undefined,
  [StepType.SendAudio]: undefined,
  [StepType.SendFile]: undefined,
  [StepType.AddTag]: undefined,
  [StepType.RemoveTag]: undefined,
  [StepType.NotifyAgent]: undefined,
  [StepType.AddCustomField]: undefined,
  [StepType.RemoveCustomField]: undefined,
  [StepType.AddCustomLog]: undefined,
  [StepType.SubscribeBot]: undefined,
  [StepType.UnsubscribeBot]: undefined,
  [StepType.RemoveContact]: undefined,
  [StepType.CallApi]: undefined,
  [StepType.InboxActions]: undefined,
  [StepType.DisableBot]: undefined,
  [StepType.EnableBot]: undefined,
  [StepType.AssignConversation]: undefined,
  [StepType.AutoAssignConversation]: undefined,
  [StepType.UnassignConversation]: undefined,
  [StepType.AddNote]: undefined,
  [StepType.FollowConversation]: undefined,
  [StepType.UnfollowConversation]: undefined,
  [StepType.ArchiveConversation]: undefined,
  [StepType.UnarchiveConversation]: undefined,
  [StepType.StepContact]: undefined,
  [StepType.OpenAIActions]: undefined,
  [StepType.OpenAIGenerateText]: undefined,
  [StepType.OpenAIGenerateTextAgent]: undefined,
  [StepType.OpenAIGenerateTextAdvanced]: undefined,
  [StepType.OpenAIGenerateTextAssistant]: undefined,
  [StepType.OpenAIGenerateImage]: undefined,
  [StepType.OpenAIAnalyzeImage]: undefined,
  [StepType.OpenAISpeechToText]: undefined,
  [StepType.OpenAITextToSpeech]: undefined,
  [StepType.OpenAIDeleteMessageHistory]: undefined,
  [StepType.EmailActions]: undefined,
  [StepType.MarkEmailVerified]: undefined,
  [StepType.OptInEmail]: undefined,
  [StepType.OptOutEmail]: undefined,
  [StepType.AddTrigger]: undefined,
  [StepType.TriggerMake]: undefined,
  [StepType.TriggerPabbly]: undefined,
  [StepType.TriggerZapier]: undefined,
  [StepType.MessengerActions]: undefined,
  [StepType.AddMessengerCustomAudience]: undefined,
  [StepType.AddMessengerRichmenu]: undefined,
  [StepType.Others]: undefined,
  [StepType.StartAnotherFlow]: undefined,
  [StepType.StartAnotherStep]: undefined,
  [StepType.StartExternalStep]: undefined,
  [StepType.CancelContactInput]: undefined,
  [StepType.Tools]: undefined,
  [StepType.GetDataFromJson]: undefined,
  [StepType.FormatDate]: undefined,
  [StepType.RandomCode]: undefined,
  [StepType.CountCharacters]: undefined,
  [StepType.SplitTraffic]: undefined,
  [StepType.StartFLow]: undefined,
  [StepType.StartFlowStep]: undefined,
  [StepType.Wait]: undefined,
  [StepType.SendMessageNode]: undefined,
  [StepType.PerformAction]: undefined,
}

export function DynamicStepEditor({
  type,
  parentName,
  ...props
}: {
  type: StepType
  parentName: string
}) {
  const Element = allSteps[type]?.editor

  return Element ? <Element parentName={parentName} {...props} /> : null
}

export function DynamicStepViewer({
  type,
  data,
  ...props
}: {
  type: StepType
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  data: any
}) {
  const Element = allSteps[type]?.viewer

  return Element ? <Element data={data} {...props} /> : null
}
