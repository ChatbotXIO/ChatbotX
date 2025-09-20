import { z } from "zod"
import { openAIDefaultFn, openAISchema } from "./open-ai"
import { StepType } from "./step-action"

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
  stepType: z.literal(StepType.OPENAI_GENERATE_IMAGE),
  // biome-ignore lint/style/noNonNullAssertion: wip
  size: z.enum([firstSize!, ...otherSizes]),
  resultCustomFieldId: z.string().cuid2(),
})

export type OpenAIGenerateImageSchema = z.infer<
  typeof openAIGenerateImageSchema
>

export const openAIGenerateImageDefaultFn = (): OpenAIGenerateImageSchema => ({
  ...openAIDefaultFn(),
  stepType: StepType.OPENAI_GENERATE_IMAGE,
  size: "dall-e-2::1024x1024",
  resultCustomFieldId: "",
})
