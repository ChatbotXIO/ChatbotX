import { ActionType } from "@/features/flows/react-flow/action-type";
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema";
import { z } from "zod";

export const openAITextToSpeechSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAITextToSpeech]),
  text: z.string().min(1).max(255),
  voiceTypeId: z.string().min(1).max(100).cuid2(),
});

export type OpenAITextToSpeechSchema = z.infer<typeof openAITextToSpeechSchema>;

export const openAITextToSpeechDefaultValue = (): OpenAITextToSpeechSchema => ({
  ...openAIDefaultValue(),
  actionType: ActionType.OpenAITextToSpeech,
  text: "",
  voiceTypeId: "",
  buttons: [],
});
