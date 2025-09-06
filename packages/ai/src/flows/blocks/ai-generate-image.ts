import { z } from "zod"
import { openAIDefaultFn } from "../../../../flow-config/src/schemas/steps/open-ai"
import { baseOpenAISchema } from "./ai-base-block"

export const openAIGenerateImageSizes: Record<string, string> = {
  "dall-e-2::256x256": "256x256 (DALL·E 2)",
  "dall-e-2::512x512": "512x512 (DALL·E 2)",
  "dall-e-2::1024x1024": "1024x1024 (DALL·E 2)",
  "dall-e-3::1024x1024": "1024x1024 (DALL·E 3)",
  "dall-e-3::1024x1792": "1792x1024 (DALL·E 3)",
  "dall-e-3::1792x1024": "1024x1792 (DALL·E 3)",
}

const [firstSize, ...otherSizes] = Object.keys(openAIGenerateImageSizes)

const stepType = "OPENAI_GENERATE_IMAGE"

export const openAIGenerateImageSchema = baseOpenAISchema.extend({
  stepType: z.literal(stepType),
  size: z.enum([firstSize!, ...otherSizes]),
  outputCFId: z.string().cuid2(),
})

export type OpenAIGenerateImageSchema = z.infer<
  typeof openAIGenerateImageSchema
>

export const openAIGenerateImageDefaultFn = (): OpenAIGenerateImageSchema => ({
  ...openAIDefaultFn(),
  stepType,
  size: "dall-e-2::1024x1024",
  outputCFId: "",
})
