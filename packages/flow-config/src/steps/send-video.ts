import { createId, zodUrlWithVariables } from "@chatbotx.io/utils"
import { z } from "zod"
import { countMessageCharacters } from "../channel-rules/characters"
import { MEDIA_CAPTION_MAX } from "../channel-rules/media-caption-rules"
import { uploadModes } from "../types"
import { flowValidationCodes } from "../validation-codes"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendVideoStepSchema = baseStepSchema.extend({
  stepType: z
    .literal(stepTypes.enum.sendVideo)
    .describe('Step type discriminator: "sendVideo".'),
  mode: uploadModes,
  url: zodUrlWithVariables(),
  // Measured like `sendText` (see its schema): the widest limit any channel
  // accepts; `refineMediaCaptionForChannel` applies the channel's own.
  caption: z
    .string()
    .trim()
    .refine(
      (value) => countMessageCharacters(value) <= MEDIA_CAPTION_MAX,
      flowValidationCodes.mediaCaptionTooLong,
    )
    .optional()
    .describe(
      "Text sent with the video as its caption. May include `{{variable}}` placeholders. Only on channels whose policy declares `limits.mediaCaption`.",
    ),
  buttons: z.array(buttonStepSchema),
})

export type SendVideoStepSchema = z.infer<typeof sendVideoStepSchema>

export const sendVideoStepDefaultFn = (): SendVideoStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendVideo,
  mode: uploadModes.enum.file,
  url: "",
  buttons: [],
})
