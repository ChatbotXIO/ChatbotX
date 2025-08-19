import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { OpenAIModel } from "./open-ai"
import { StepType } from "./step-action"

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

export const openAITextToSpeechSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OPENAI_TEXT_TO_SPEECH),
  model: z.nativeEnum(OpenAIModel),
  userMessage: z.string(),
  voiceType: z.enum([fistVoiceType, ...otherVoiceTypes]),
  outputCustomFieldId: z.string().cuid2(),
})

export type OpenAITextToSpeechSchema = z.infer<typeof openAITextToSpeechSchema>

export const openAITextToSpeechDefaultFn = (): OpenAITextToSpeechSchema => ({
  id: createId(),
  model: OpenAIModel.GPT4oMini,
  stepType: StepType.OPENAI_TEXT_TO_SPEECH,
  userMessage: "",
  voiceType: "",
  outputCustomFieldId: "",
})
