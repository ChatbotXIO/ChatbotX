import { StepType } from "@/features/flows/react-flow/steps/step-action"
import {
  openAIDefaultFn,
  openAISchema,
} from "@/features/flows/react-flow/steps/open-ai/schema"
import { z } from "zod"

export const voiceTypes: Record<string, string> = {
  alloy: "Alloy",
  ash: "Ash",
  coral: "Coral",
  echo: "Echo",
  fable: "Fable",
  onyx: "Onyx",
  nova: "Nova",
  sage: "Sage",
  shimmer: "Shimmer",
}
const [fistVoiceType, ...otherVoiceTypes] = Object.keys(voiceTypes)

export const openAITextToSpeechSchema = openAISchema.extend({
  stepType: z.literal(StepType.OpenAITextToSpeech),
  userMessage: z.string(),
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  voiceType: z.enum([fistVoiceType!, ...otherVoiceTypes]),
  resultCustomFieldId: z.string().cuid2(),
})

export type OpenAITextToSpeechSchema = z.infer<typeof openAITextToSpeechSchema>

export const openAITextToSpeechDefaultFn = (): OpenAITextToSpeechSchema => ({
  ...openAIDefaultFn(),
  stepType: StepType.OpenAITextToSpeech,
  userMessage: "",
  voiceType: "",
  resultCustomFieldId: "",
})
