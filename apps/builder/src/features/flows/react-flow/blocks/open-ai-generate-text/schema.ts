import { ActionType } from "@/features/flows/react-flow/action-type";
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema";
import { z } from "zod";

export const openAIGenerateTextSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAIGenerateText]),
  prompt: z.string().optional(),
});

export type OpenAIGenerateTextSchema = z.infer<typeof openAIGenerateTextSchema>;

export const openAIGenerateTextDefaultValue = (): OpenAIGenerateTextSchema => ({
  ...openAIDefaultValue(),
  actionType: ActionType.OpenAIGenerateText,
  buttons: [],
});
