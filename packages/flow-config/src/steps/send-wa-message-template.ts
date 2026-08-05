import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepDefaultFn, buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"
import { whatsappFlowFieldMappingSchema } from "./whatsapp-flow"

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
  flowSourceId: z.string().optional(),
  navigateScreenId: z.string().optional(),
  fieldMappings: z.array(whatsappFlowFieldMappingSchema).optional(),
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
        // NAMED-template placeholder name for a text header; see body note.
        parameter_name: z.string().optional(),
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
        // Present only for NAMED templates ({{order_id}}); Meta requires it to
        // be echoed back on every send-time parameter. Absent for positional
        // templates ({{1}}), which must omit it.
        parameter_name: z.string().optional(),
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
  // Meta returns flow_id as a JSON number (e.g. 1690702985711558), not a string.
  flow_id?: string | number
  flow_action?: string
  navigate_screen?: string
}

/**
 * Coerces an optional Meta-sourced value to a string. WhatsApp template
 * component JSON delivers numeric ids (notably `flow_id`) as JSON numbers, but
 * our schemas store them as strings — assigning the raw number trips Zod's
 * "expected string, received number" and breaks string equality checks.
 */
export const toOptionalString = (
  value: string | number | null | undefined,
): string | undefined =>
  value === null || value === undefined ? undefined : String(value)

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

// Matches a single Meta template placeholder, capturing its token: positional
// ({{1}}) or named ({{order_id}}). `.match()` resets lastIndex per call, so a
// shared module-level global regex is safe under concurrent sends.
const TEMPLATE_PLACEHOLDER_REGEX = /\{\{(\d+|[a-zA-Z_]+)\}\}/g
const PLACEHOLDER_BRACES_REGEX = /\{\{|\}\}/g
const POSITIONAL_TOKEN_REGEX = /^\d+$/

/**
 * A purely numeric placeholder token ({{1}}) is positional; any other token is
 * a named parameter. Meta requires named parameters to be echoed back as
 * `parameter_name` on every send-time parameter, while positional ones must
 * omit it entirely.
 */
export function isNamedTemplateToken(token: string): boolean {
  return !POSITIONAL_TOKEN_REGEX.test(token)
}

type TemplateTextParam = {
  type: "text"
  text: string
  parameter_name?: string
}

/**
 * Builds the send-time text params for a body/header from its raw template
 * text. Named placeholders carry `parameter_name`; positional placeholders
 * keep their exact existing shape so running templates never change.
 */
function extractTextParams(text: string): TemplateTextParam[] {
  const matches = text.match(TEMPLATE_PLACEHOLDER_REGEX)
  if (!matches) {
    return []
  }

  return matches.map((match) => {
    const token = match.replace(PLACEHOLDER_BRACES_REGEX, "")
    return isNamedTemplateToken(token)
      ? { type: "text", text: "", parameter_name: token }
      : { type: "text", text: "" }
  })
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
        flowSourceId: toOptionalString(button.flow_id),
        navigateScreenId: toOptionalString(button.navigate_screen),
        fieldMappings: [],
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
        const headerParams = extractTextParams(component.text)
        if (headerParams.length > 0) {
          params.header = headerParams
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
      const bodyParams = extractTextParams(component.text)
      if (bodyParams.length > 0) {
        params.body = bodyParams
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
    // Persist the selected WhatsApp channel so the editor rehydrates it (and its
    // template list) after publish/reload. Optional (`.nullish()`): the send path
    // resolves the channel from the flow/contact context, so this is editor state
    // that is absent in send code and in flows saved before the field existed.
    inboxId: zodBigintAsString().nullish(),
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
): SendWaTemplateMessageStepSchema => {
  const { template: templateProps, ...restProps } = props
  return {
    template: {
      id: "",
      name: "",
      language: "",
      inboxId: null,
      params: {},
      ...templateProps,
    },
    buttons: [
      buttonStepDefaultFn({ label: "Delivered" }),
      buttonStepDefaultFn({ label: "Failed" }),
    ],
    ...restProps,
    id: createId(),
    stepType: stepTypes.enum.sendWaTemplateMessage,
  }
}
