import type {
  SendWaTemplateMessageStepSchema,
  WaTemplateButtonParam,
  WaTemplateCarouselCard,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import type {
  TemplateMessage,
  WhatsAppTemplateComponent,
  WhatsAppTemplateComponentParameter,
  WhatsappAuthValue,
} from "../../../schema"

export function* convertFlowStepWaTemplate(
  props: Parameters<
    MessageHandlers<
      WhatsappAuthValue,
      SendWaTemplateMessageStepSchema
    >["sendFlowStep"]
  >[0],
): Generator<TemplateMessage> {
  const {
    data: { step },
  } = props
  const template = step.template

  const components = buildTemplateComponents(template.params)

  yield {
    _type: "template",
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components,
    },
  }
}

function buildButtonParameter(
  param: WaTemplateButtonParam,
): WhatsAppTemplateComponentParameter {
  const subType = param.sub_type || "url"

  switch (subType) {
    case "url":
      return {
        type: "text",
        text: param.text || "",
      }
    case "copy_code":
      return {
        type: "coupon_code",
        coupon_code: param.coupon_code || "",
      }
    case "quick_reply":
      return {
        type: "payload",
        payload: param.payload || "",
      }
    case "flow":
      return {
        type: "action",
        action: {
          flow_token: param.flow_token || "",
          flow_action_data: param.flow_action_data || {},
        },
      }
    case "catalog":
      return {
        type: "action",
        action: {
          thumbnail_product_retailer_id:
            param.thumbnail_product_retailer_id || "",
        },
      }
    case "mpm":
      return {
        type: "action",
        action: {
          sections: param.sections || [],
        },
      }
    default:
      return {
        type: "text",
        text: param.text || "",
      }
  }
}

function buildButtonComponents(
  buttons: WaTemplateButtonParam[],
): WhatsAppTemplateComponent[] {
  const components: WhatsAppTemplateComponent[] = []

  for (let i = 0; i < buttons.length; i++) {
    const param = buttons[i]
    const subType = param.sub_type || "url"

    components.push({
      type: "button",
      sub_type: subType,
      index: param.index ?? i,
      parameters: [buildButtonParameter(param)],
    })
  }

  return components
}

function buildCarouselComponent(
  cards: WaTemplateCarouselCard[],
): WhatsAppTemplateComponent {
  return {
    type: "carousel",
    cards: cards.map((card) => {
      const cardComponents: WhatsAppTemplateComponent[] = []

      if (card.header && card.header.length > 0) {
        const headerParam = card.header[0]
        const headerParams: WhatsAppTemplateComponentParameter[] = []

        if (headerParam.type === "image" && headerParam.image?.link) {
          headerParams.push({
            type: "image",
            image: { link: headerParam.image.link },
          })
        } else if (headerParam.type === "video" && headerParam.video?.link) {
          headerParams.push({
            type: "video",
            video: { link: headerParam.video.link },
          })
        }

        if (headerParams.length > 0) {
          cardComponents.push({
            type: "header",
            parameters: headerParams,
          })
        }
      }

      if (card.body && card.body.length > 0) {
        cardComponents.push({
          type: "body",
          parameters: card.body.map((param) => ({
            type: "text",
            text: param.text,
          })),
        })
      }

      if (card.button && card.button.length > 0) {
        cardComponents.push(...buildButtonComponents(card.button))
      }

      return {
        card_index: card.card_index,
        components: cardComponents,
      }
    }),
  }
}

function buildTemplateComponents(
  params: SendWaTemplateMessageStepSchema["template"]["params"],
) {
  const components: WhatsAppTemplateComponent[] = []

  if (params.header && params.header.length > 0) {
    const headerParams = params.header.map((param) => {
      if (param.type === "text" && param.text) {
        return {
          type: "text",
          text: param.text,
        }
      }
      if (param.type === "image" && param.image?.link) {
        return {
          type: "image",
          image: {
            link: param.image.link,
          },
        }
      }
      if (param.type === "video" && param.video?.link) {
        return {
          type: "video",
          video: {
            link: param.video.link,
          },
        }
      }
      if (param.type === "document" && param.document?.link) {
        return {
          type: "document",
          document: {
            link: param.document.link,
          },
        }
      }
      if (param.type === "location" && param.location) {
        return {
          type: "location",
          location: {
            latitude: param.location.latitude || "",
            longitude: param.location.longitude || "",
            name: param.location.name || "",
            address: param.location.address || "",
          },
        }
      }
      return { type: "text", text: "" }
    })
    components.push({
      type: "header",
      parameters: headerParams,
    })
  }

  if (params.body && params.body.length > 0) {
    const bodyParams = params.body.map((param) => ({
      type: "text",
      text: param.text,
    }))
    components.push({
      type: "body",
      parameters: bodyParams,
    })
  }

  if (params.button && params.button.length > 0) {
    components.push(...buildButtonComponents(params.button))
  }

  if (params.carousel && params.carousel.length > 0) {
    components.push(buildCarouselComponent(params.carousel))
  }

  if (params.limited_time_offer) {
    components.push({
      type: "limited_time_offer",
      parameters: [
        {
          type: "limited_time_offer",
          // @ts-expect-error - Meta API uses this structure
          limited_time_offer: {
            expiration_time_ms: params.limited_time_offer.expiration_time_ms,
          },
        },
      ],
    })
  }

  return components
}
