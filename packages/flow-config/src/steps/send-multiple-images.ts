import { createId, zodUrlWithVariables } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

// One image slot — same {mode, url} shape as sendImageStepSchema (minus
// buttons) so the builder can reuse `MediaLibraryOrInsertLink` verbatim per
// array item, the way `sendCardStepSchema.image` already does.
export const sendMultipleImagesItemSchema = z.object({
  id: z.string(),
  mode: uploadModes,
  url: zodUrlWithVariables(),
})
export type SendMultipleImagesItemSchema = z.infer<
  typeof sendMultipleImagesItemSchema
>

export const sendMultipleImagesItemDefaultFn =
  (): SendMultipleImagesItemSchema => ({
    id: createId(),
    mode: uploadModes.enum.file,
    url: "",
  })

export const sendMultipleImagesStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendMultipleImages),
  images: z.array(sendMultipleImagesItemSchema).min(2).max(10),
})

export type SendMultipleImagesStepSchema = z.infer<
  typeof sendMultipleImagesStepSchema
>

export const sendMultipleImagesStepDefaultFn =
  (): SendMultipleImagesStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.sendMultipleImages,
    images: [
      sendMultipleImagesItemDefaultFn(),
      sendMultipleImagesItemDefaultFn(),
    ],
  })
