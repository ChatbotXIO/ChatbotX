import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { stepTypes } from "./step-action"

export const AI_EDIT_IMAGE_DEFAULT_OPENAI_MODEL = "gpt-image-1-mini" as const
export const AI_EDIT_IMAGE_FALLBACK_OPENAI_MODEL = "gpt-image-1" as const
export const AI_EDIT_IMAGE_DEFAULT_GEMINI_MODEL =
  "gemini-3.1-flash-image-preview" as const

export const AI_EDIT_IMAGE_DEFAULT_OPENAI_SIZE = "1024x1024" as const
export const AI_EDIT_IMAGE_DEFAULT_GEMINI_SIZE = "1:1" as const

export const AI_EDIT_IMAGE_DEFAULT_OPENAI_QUALITY = "low" as const
export const AI_EDIT_IMAGE_DEFAULT_GEMINI_QUALITY = "auto" as const

export const aiEditImageProvider = z.enum(["openai", "gemini"])
export type AIEditImageProvider = z.infer<typeof aiEditImageProvider>

export const aiEditImageDefaultModels: Record<AIEditImageProvider, string> = {
  openai: AI_EDIT_IMAGE_DEFAULT_OPENAI_MODEL,
  gemini: AI_EDIT_IMAGE_DEFAULT_GEMINI_MODEL,
}

export const aiEditImageDefaultSizes: Record<AIEditImageProvider, string> = {
  openai: AI_EDIT_IMAGE_DEFAULT_OPENAI_SIZE,
  gemini: AI_EDIT_IMAGE_DEFAULT_GEMINI_SIZE,
}

export const aiEditImageDefaultQualities: Record<AIEditImageProvider, string> =
  {
    openai: AI_EDIT_IMAGE_DEFAULT_OPENAI_QUALITY,
    gemini: AI_EDIT_IMAGE_DEFAULT_GEMINI_QUALITY,
  }

export const aiEditImageSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiEditImage),
  provider: aiEditImageProvider,
  model: z.string().trim().min(1),
  inputFieldId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  size: z.string().trim().min(1),
  quality: z.string().trim().min(1),
  outputFieldId: z.string().trim().min(1),
})

export type AIEditImageSchema = z.infer<typeof aiEditImageSchema>

export const aiEditImageDefaultFn = (
  props: Partial<AIEditImageSchema> = {},
): AIEditImageSchema => {
  const provider = props.provider ?? "openai"

  return {
    id: createId(),
    provider,
    model: props.model ?? aiEditImageDefaultModels[provider],
    inputFieldId: "",
    prompt: "",
    size: props.size ?? aiEditImageDefaultSizes[provider],
    quality: props.quality ?? aiEditImageDefaultQualities[provider],
    outputFieldId: "",
    ...props,
    stepType: stepTypes.enum.aiEditImage,
  }
}
