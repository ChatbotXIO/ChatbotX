import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepDefaultFn, buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const waTemplateParamsSchema = z.object({
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
})

export type WaTemplateParams = z.infer<typeof waTemplateParamsSchema>

export type TemplateComponent = {
  type: string
  format?: string
  text?: string
  example?: unknown
  buttons?: Array<{
    type: string
    text: string
    url?: string
    example?: string[]
  }>
}

export function extractTemplateParams(
  components: TemplateComponent[],
): WaTemplateParams {
  const params: WaTemplateParams = {}

  if (!components || components.length === 0) {
    return params
  }

  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text) {
        const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
        if (matches) {
          params.header = matches.map(() => ({
            type: "text" as const,
            text: "",
          }))
        }
      } else if (
        ["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format || "")
      ) {
        const format = component.format?.toLowerCase() as
          | "image"
          | "video"
          | "document"
        params.header = [
          {
            type: format,
            [format]: { link: "" },
          },
        ]
      }
    } else if (component.type === "BODY" && component.text) {
      const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
      if (matches) {
        params.body = matches.map(() => ({
          type: "text" as const,
          text: "",
        }))
      }
    } else if (component.type === "BUTTONS" && component.buttons) {
      const urlButtons = component.buttons
        .map((button, idx) => ({
          button,
          index: idx,
        }))
        .filter(
          ({ button }) =>
            button.type === "URL" && button.url?.includes("{{1}}"),
        )

      if (urlButtons.length > 0) {
        params.button = urlButtons.map(({ index }) => ({
          type: "text" as const,
          text: "",
          index,
        }))
      }
    }
  }

  return params
}

export const sendWaTemplateMessageStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendWaTemplateMessage),
  template: z.object({
    id: z.string().trim().min(1),
    name: z.string(),
    language: z.string(),
    params: waTemplateParamsSchema,
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
    language: "",
    params: {},
  },
  buttons: [
    buttonStepDefaultFn({ label: "Delivered" }),
    buttonStepDefaultFn({ label: "Failed" }),
  ],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendWaTemplateMessage,
})
