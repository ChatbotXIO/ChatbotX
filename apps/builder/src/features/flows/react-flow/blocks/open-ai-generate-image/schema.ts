import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIGenerateImageSizes: Record<string, string> = {
  "dall-e-2::256x256": "256x256 (DALL·E 2)",
  "dall-e-2::512x512": "512x512 (DALL·E 2)",
  "dall-e-2::1024x1024": "1024x1024 (DALL·E 2)",
  "dall-e-3::1024x1024": "1024x1024 (DALL·E 3)",
  "dall-e-3::1024x1792": "1792x1024 (DALL·E 3)",
  "dall-e-3::1792x1024": "1024x1792 (DALL·E 3)",
}

const [firstSize, ...otherSizes] = Object.keys(openAIGenerateImageSizes)

export const openAIGenerateImageSchema = openAISchema.extend({
  actionType: z.literal(ActionType.OpenAIGenerateImage),
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  size: z.enum([firstSize!, ...otherSizes]),
  resultCustomFieldId: z.string().cuid2(),
})

export type OpenAIGenerateImageSchema = z.infer<
  typeof openAIGenerateImageSchema
>

export const openAIGenerateImageDefaultValue =
  (): OpenAIGenerateImageSchema => ({
    ...openAIDefaultValue(),
    actionType: ActionType.OpenAIGenerateImage,
    size: "dall-e-2::1024x1024",
    resultCustomFieldId: "",
  })
