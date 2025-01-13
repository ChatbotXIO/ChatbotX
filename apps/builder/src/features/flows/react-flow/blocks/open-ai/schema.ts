import { buttonBlockSchema } from "@/features/flows/react-flow/blocks/button/schema";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";

export enum OpenAIModel {
  GPT4oMini = "gpt-4o-mini",
  GPT35Turbo16K = "gpt-35-turbo-16K",
  GPT4o = "gpt-4o",
  GPT4 = "gpt-4",
  GPT4Turbo = "gpt-4-turbo",
  GPT4TurboPreview = "gpt-4-turbo-preview",
  ChatGPT4oLatest = "chat-gpt-4o-latest",
  O1Preview = "o1-preview",
  O1Mini = "o1-mini",
}

export const openAISchema = z.object({
  id: z.string(),
  model: z.nativeEnum(OpenAIModel),
  userMessage: z.string().min(1).max(255).optional(),
  customFieldId: z.string().min(1).max(255).cuid2().optional(),
  aiTriggerIds: z.array(z.string()).optional(),
  buttons: z.array(buttonBlockSchema).optional(),
});

export type OpenAISchema = z.infer<typeof openAISchema>;

export const openAIDefaultValue = (): OpenAISchema => ({
  id: createId(),
  model: OpenAIModel.GPT4oMini,
});
