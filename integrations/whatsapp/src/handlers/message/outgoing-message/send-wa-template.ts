import type {
  SendWaTemplateMessageStepSchema,
  WaTemplateButtonParam,
  WaTemplateCarouselCard,
} from "@chatbotx.io/flow-config"
import {
  encodeTemplateFlowToken,
  extractMetadata,
  TemplateFlowOrigin,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type {
  TemplateMessage,
  WhatsAppTemplateComponent,
  WhatsAppTemplateComponentParameter,
  WhatsappAuthValue,
} from "../../../schema"

type TemplateFlowTokenContext = {
  flowId: string
  flowVersionId?: string
  stepId: string
  broadcastId?: string
}

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

  const components = buildTemplateComponents(template.params, {
    flowId: props.data.flowId,
    flowVersionId: props.data.flowVersionId,
    stepId: step.id,
    broadcastId: extractMetadata("broadcastId", props.data.metadata),
  })

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
  tokenContext: TemplateFlowTokenContext,
  cardIndex?: number,
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
      return buildFlowButtonParameter(param, tokenContext, cardIndex)
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

function buildFlowButtonParameter(
  param: WaTemplateButtonParam,
  tokenContext: TemplateFlowTokenContext,
  cardIndex?: number,
): WhatsAppTemplateComponentParameter {
  const flowToken = buildTemplateFlowToken(param, tokenContext, cardIndex)
  const flowActionData = param.flow_action_data
  const hasFlowActionData =
    flowActionData && Object.keys(flowActionData).length > 0

  return {
    type: "action",
    action: {
      ...(flowToken ? { flow_token: flowToken } : {}),
      ...(hasFlowActionData ? { flow_action_data: flowActionData } : {}),
    },
  }
}

function buildTemplateFlowToken(
  param: WaTemplateButtonParam,
  tokenContext: TemplateFlowTokenContext,
  cardIndex?: number,
): string | null {
  const buttonIndex = param.index
  if (buttonIndex === undefined) {
    logger.warn(
      { stepId: tokenContext.stepId, broadcastId: tokenContext.broadcastId },
      "WhatsApp template FLOW button skipped token generation: missing button index",
    )
    return null
  }

  if (tokenContext.broadcastId && !tokenContext.flowId) {
    return encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: tokenContext.broadcastId,
      buttonIndex,
      ...(cardIndex === undefined ? {} : { cardIndex }),
    })
  }

  if (tokenContext.flowId && tokenContext.stepId) {
    return encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.FlowStep,
      flowId: tokenContext.flowId,
      flowVersionId: tokenContext.flowVersionId,
      stepId: tokenContext.stepId,
      buttonIndex,
      ...(cardIndex === undefined ? {} : { cardIndex }),
    })
  }

  logger.warn(
    { stepId: tokenContext.stepId, broadcastId: tokenContext.broadcastId },
    "WhatsApp template FLOW button sent without generated token: origin could not be resolved",
  )
  return null
}

function buildButtonComponents(
  buttons: WaTemplateButtonParam[],
  tokenContext: TemplateFlowTokenContext,
  cardIndex?: number,
): WhatsAppTemplateComponent[] {
  const components: WhatsAppTemplateComponent[] = []

  for (let i = 0; i < buttons.length; i++) {
    const param = buttons[i]
    const subType = param.sub_type || "url"

    components.push({
      type: "button",
      sub_type: subType,
      index: param.index ?? i,
      parameters: [buildButtonParameter(param, tokenContext, cardIndex)],
    })
  }

  return components
}

function buildCarouselComponent(
  cards: WaTemplateCarouselCard[],
  tokenContext: TemplateFlowTokenContext,
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
        cardComponents.push(
          ...buildButtonComponents(card.button, tokenContext, card.card_index),
        )
      }

      return {
        card_index: card.card_index,
        components: cardComponents,
      }
    }),
  }
}

/**
 * Builds a text parameter, echoing `parameter_name` back to Meta only when the
 * template placeholder is named ({{order_id}}). Positional placeholders ({{1}})
 * leave it out, so their payload shape is byte-for-byte unchanged.
 */
function buildTextParameter(param: {
  text?: string
  parameter_name?: string
}): WhatsAppTemplateComponentParameter {
  return {
    type: "text",
    text: param.text ?? "",
    ...(param.parameter_name ? { parameter_name: param.parameter_name } : {}),
  }
}

function buildTemplateComponents(
  params: SendWaTemplateMessageStepSchema["template"]["params"],
  tokenContext: TemplateFlowTokenContext,
) {
  const components: WhatsAppTemplateComponent[] = []

  if (params.header && params.header.length > 0) {
    const headerParams = params.header.map((param) => {
      if (param.type === "text" && param.text) {
        return buildTextParameter(param)
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
    const bodyParams = params.body.map((param) => buildTextParameter(param))
    components.push({
      type: "body",
      parameters: bodyParams,
    })
  }

  if (params.button && params.button.length > 0) {
    components.push(...buildButtonComponents(params.button, tokenContext))
  }

  if (params.carousel && params.carousel.length > 0) {
    components.push(buildCarouselComponent(params.carousel, tokenContext))
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
