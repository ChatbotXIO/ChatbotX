import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepDefaultFn, buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendWaTemplateMessageStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendWaTemplateMessage),
  template: z.object({
    id: z.string().trim().min(1),
    name: z.string(),
    languageCode: z.string(),
    params: z.object({
      header: z
        .array(
          z.object({
            type: z.enum(["text", "image", "video", "document"]),
            text: z.string().optional(),
            image: z.object({ link: z.string() }).optional(),
            video: z.object({ link: z.string() }).optional(),
            document: z.object({ link: z.string() }).optional(),
          }),
        )
        .optional(),
      body: z
        .array(
          z.object({
            type: z.literal("text").optional(),
            text: z.string(),
          }),
        )
        .optional(),
      button: z
        .array(
          z.object({
            type: z.literal("text").optional(),
            text: z.string(),
            index: z.number().optional(),
          }),
        )
        .optional(),
    }),
  }),
  buttons: z
    .array(buttonStepSchema)
    .default([])
    .transform((buttons) => {
      const templateButtons = buttons.map((btn) => ({
        id: btn.id,
        label: btn.label,
        beforeStep: null,
        steps: [],
        buttonType: null,
      }))

      if (templateButtons.length === 0) {
        return [
          buttonStepDefaultFn({ label: "Delivered" }),
          buttonStepDefaultFn({ label: "Failed" }),
        ]
      }

      return templateButtons
    }),
})

export type SendWaTemplateMessageStepSchema = z.infer<
  typeof sendWaTemplateMessageStepSchema
>

export const sendWaTemplateMessageStepDefaultFn = (
  props: Partial<SendWaTemplateMessageStepSchema> = {},
): SendWaTemplateMessageStepSchema => ({
  template: {
    id: "",
    name: "",
    languageCode: "",
    params: {},
  },
  buttons: [
    buttonStepDefaultFn({ label: "Delivered" }),
    buttonStepDefaultFn({ label: "Failed" }),
  ],
  ...props,
  id: createId(),
  stepType: StepType.sendWaTemplateMessage,
})
