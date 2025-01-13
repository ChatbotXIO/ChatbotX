import { ActionType } from "@/features/flows/react-flow/action-type";
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema";
import { z } from "zod";

export const openAIGenerateImageSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAIGenerateImage]),
  sizeId: z.string().min(1).max(100).cuid2(),
});

export type OpenAIGenerateImageSchema = z.infer<
  typeof openAIGenerateImageSchema
>;

export const openAIGenerateImageDefaultValue =
  (): OpenAIGenerateImageSchema => ({
    ...openAIDefaultValue(),
    actionType: ActionType.OpenAIGenerateImage,
    sizeId: "",
    buttons: [],
  });
