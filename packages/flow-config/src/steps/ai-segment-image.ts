import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { zodFieldReference } from "../field-reference"
import {
  errorStateDefaultFn,
  errorStateSchema,
  skipStateDefaultFn,
  skipStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const AI_SEGMENT_IMAGE_TARGET_MAX_LENGTH = 160

export const aiSegmentImageMatchSelection = z.enum(["all", "largest"])
export type AISegmentImageMatchSelection = z.infer<
  typeof aiSegmentImageMatchSelection
>

export const aiSegmentImageSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.aiSegmentImage)
      .describe('Step type discriminator: "aiSegmentImage".'),
    inputFieldId: zodFieldReference().describe(
      "Custom field holding the source image URL.",
    ),
    target: z
      .string()
      .trim()
      .min(1)
      .max(AI_SEGMENT_IMAGE_TARGET_MAX_LENGTH)
      .describe(
        'Short concrete noun phrase naming the object to find, e.g. "red car" or "product box". Not a command or question.',
      ),
    matchSelection: aiSegmentImageMatchSelection.describe(
      '"largest" crops to the largest matched object\'s box; "all" crops to the area covering every match.',
    ),
    outputFieldId: zodFieldReference().describe(
      "Custom field that receives the cropped image URL: JPEG, or PNG when the source has real transparency. May equal inputFieldId to replace the source image.",
    ),
    detailsOutputFieldId: zodFieldReference()
      .optional()
      .describe(
        "Optional custom field that receives JSON detection details ({ count, boxes, crop, source }); boxes are half-open source pixels with an optional 0-1 confidence.",
      ),
    states: z
      .tuple([successStateSchema, skipStateSchema, errorStateSchema])
      .describe(
        "Exactly [success, skip, error]: success = object found, skip = no object found, error = processing failed.",
      ),
  })
  .superRefine((value, ctx) => {
    if (!value.detailsOutputFieldId) {
      return
    }
    if (value.detailsOutputFieldId === value.outputFieldId) {
      ctx.addIssue({
        code: "custom",
        path: ["detailsOutputFieldId"],
        message: "Details field must differ from the output image field",
      })
    }
    if (value.detailsOutputFieldId === value.inputFieldId) {
      ctx.addIssue({
        code: "custom",
        path: ["detailsOutputFieldId"],
        message: "Details field must differ from the source image field",
      })
    }
  })

export type AISegmentImageSchema = z.infer<typeof aiSegmentImageSchema>

export const aiSegmentImageDefaultFn = (
  props: Partial<AISegmentImageSchema> = {},
): AISegmentImageSchema => ({
  id: createId(),
  inputFieldId: "",
  target: "",
  matchSelection: aiSegmentImageMatchSelection.enum.largest,
  outputFieldId: "",
  ...props,
  stepType: stepTypes.enum.aiSegmentImage,
  states: [
    successStateDefaultFn(),
    skipStateDefaultFn(),
    errorStateDefaultFn(),
  ],
})
