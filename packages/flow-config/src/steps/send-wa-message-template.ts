import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepDefaultFn, buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const buttonSubTypes = z.enum([
  "url",
  "quick_reply",
  "copy_code",
  "flow",
  "catalog",
  "mpm",
])
export type ButtonSubType = z.infer<typeof buttonSubTypes>

export const waTemplateButtonParamSchema = z.object({
  sub_type: buttonSubTypes.optional(),
  index: z.number().optional(),
  text: z.string().optional(),
  coupon_code: z.string().optional(),
  payload: z.string().optional(),
  flow_token: z.string().optional(),
  flow_action_data: z.record(z.string(), z.unknown()).optional(),
  thumbnail_product_retailer_id: z.string().optional(),
  sections: z
    .array(
      z.object({
        title: z.string().optional(),
        product_items: z
          .array(
            z.object({
              product_retailer_id: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
})
export type WaTemplateButtonParam = z.infer<typeof waTemplateButtonParamSchema>

export const waTemplateCarouselCardSchema = z.object({
  card_index: z.number(),
  header: z
    .array(
      z.object({
        type: z.enum(["image", "video"]),
        image: z.object({ link: z.string() }).optional(),
        video: z.object({ link: z.string() }).optional(),
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
  button: z.array(waTemplateButtonParamSchema).optional(),
})
export type WaTemplateCarouselCard = z.infer<
  typeof waTemplateCarouselCardSchema
>

export const waTemplateParamsSchema = z.object({
  header: z
    .array(
      z.object({
        type: z.enum(["text", "image", "video", "document", "location"]),
        text: z.string().optional(),
        image: z.object({ link: z.string() }).optional(),
        video: z.object({ link: z.string() }).optional(),
        document: z.object({ link: z.string() }).optional(),
        location: z
          .object({
            latitude: z.string().optional(),
            longitude: z.string().optional(),
            name: z.string().optional(),
            address: z.string().optional(),
          })
          .optional(),
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
  button: z.array(waTemplateButtonParamSchema).optional(),
  carousel: z.array(waTemplateCarouselCardSchema).optional(),
  limited_time_offer: z
    .object({
      expiration_time_ms: z.number(),
    })
    .optional(),
})

export type WaTemplateParams = z.infer<typeof waTemplateParamsSchema>

export type TemplateComponentButton = {
  type: string
  text: string
  url?: string
  phone_number?: string
  example?: string[]
  flow_id?: string
  flow_action?: string
  navigate_screen?: string
}

export type TemplateComponentCard = {
  card_index: number
  components: Array<{
    type: string
    format?: string
    text?: string
    example?: unknown
    buttons?: TemplateComponentButton[]
  }>
}

export type TemplateComponent = {
  type: string
  format?: string
  text?: string
  example?: unknown
  buttons?: TemplateComponentButton[]
  cards?: TemplateComponentCard[]
  limited_time_offer?: {
    has_expiration: boolean
  }
}

function extractButtonParams(
  buttons: TemplateComponentButton[],
): WaTemplateButtonParam[] {
  const buttonParams: WaTemplateButtonParam[] = []

  for (const [idx, button] of buttons.entries()) {
    const buttonType = button.type.toUpperCase()

    if (buttonType === "URL" && button.url?.includes("{{1}}")) {
      buttonParams.push({
        sub_type: "url",
        index: idx,
        text: "",
      })
    } else if (buttonType === "COPY_CODE") {
      buttonParams.push({
        sub_type: "copy_code",
        index: idx,
        coupon_code: "",
      })
    } else if (buttonType === "QUICK_REPLY") {
      buttonParams.push({
        sub_type: "quick_reply",
        index: idx,
        payload: "",
      })
    } else if (buttonType === "FLOW") {
      buttonParams.push({
        sub_type: "flow",
        index: idx,
        flow_token: "",
        flow_action_data: {},
      })
    } else if (buttonType === "CATALOG") {
      buttonParams.push({
        sub_type: "catalog",
        index: idx,
        thumbnail_product_retailer_id: "",
      })
    } else if (buttonType === "MPM") {
      buttonParams.push({
        sub_type: "mpm",
        index: idx,
        sections: [],
      })
    }
  }

  return buttonParams
}

function extractCarouselParams(
  cards: TemplateComponentCard[],
): WaTemplateParams["carousel"] {
  return cards.map((card) => {
    const cardParams: WaTemplateParams["carousel"] extends
      | (infer T)[]
      | undefined
      ? T
      : never = {
      card_index: card.card_index,
    }

    for (const comp of card.components) {
      if (comp.type === "HEADER") {
        if (comp.format === "IMAGE") {
          cardParams.header = [{ type: "image", image: { link: "" } }]
        } else if (comp.format === "VIDEO") {
          cardParams.header = [{ type: "video", video: { link: "" } }]
        }
      } else if (comp.type === "BODY" && comp.text) {
        const matches = comp.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
        if (matches) {
          cardParams.body = matches.map(() => ({
            type: "text" as const,
            text: "",
          }))
        }
      } else if (comp.type === "BUTTONS" && comp.buttons) {
        cardParams.button = extractButtonParams(comp.buttons)
      }
    }

    return cardParams
  })
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
      } else if (component.format === "LOCATION") {
        params.header = [
          {
            type: "location" as const,
            location: {
              latitude: "",
              longitude: "",
              name: "",
              address: "",
            },
          },
        ]
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
      const buttonParams = extractButtonParams(component.buttons)
      if (buttonParams.length > 0) {
        params.button = buttonParams
      }
    } else if (component.type === "CAROUSEL" && component.cards) {
      params.carousel = extractCarouselParams(component.cards)
    } else if (
      component.type === "LIMITED_TIME_OFFER" &&
      component.limited_time_offer?.has_expiration
    ) {
      params.limited_time_offer = {
        expiration_time_ms: 0,
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
