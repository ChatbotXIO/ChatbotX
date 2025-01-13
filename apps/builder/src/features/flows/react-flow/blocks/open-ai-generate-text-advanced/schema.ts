import { ActionType } from "@/features/flows/react-flow/action-type";
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema";
import { z } from "zod";

export const openAIGenerateTextAdvancedSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAIGenerateTextAdvanced]),
  prompt: z.string().optional(),
});

export type OpenAIGenerateTextAdvancedSchema = z.infer<
  typeof openAIGenerateTextAdvancedSchema
>;

export const openAIGenerateTextAdvancedDefaultValue =
  (): OpenAIGenerateTextAdvancedSchema => ({
    ...openAIDefaultValue(),
    actionType: ActionType.OpenAIGenerateTextAdvanced,
    buttons: [],
  });
