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

const DEFAULT_BUTTON_SUB_TYPE = "url"

const isBlank = (value: string | undefined): boolean => !value?.trim()

/**
 * Whether the entry carries a real value for its sub_type. Used to pick the
 * winner among duplicate entries; sub_types whose value is generated at send
 * time (flow tokens) always count as content.
 */
const buttonParamContentChecks: Record<
  string,
  (param: WaTemplateButtonParam) => boolean
> = {
  url: (param) => !isBlank(param.text),
  quick_reply: (param) => !isBlank(param.payload),
  copy_code: (param) => !isBlank(param.coupon_code),
  flow: () => true,
  catalog: (param) => !isBlank(param.thumbnail_product_retailer_id),
  mpm: (param) => (param.sections?.length ?? 0) > 0,
}

const buttonSubTypeOf = (param: WaTemplateButtonParam): string =>
  param.sub_type || DEFAULT_BUTTON_SUB_TYPE

const hasButtonParamContent = (param: WaTemplateButtonParam): boolean =>
  buttonParamContentChecks[buttonSubTypeOf(param)]?.(param) ?? true

/**
 * Sub_types whose whole button component must be OMITTED (not sent with an
 * empty value) when the entry carries no content — Meta rejects an explicit
 * `payload: ""`/`thumbnail_product_retailer_id: ""` rather than treating it
 * as "no value". The catalog thumbnail is documented optional: Meta applies
 * the catalog's own default thumbnail when the component is left out
 * entirely, exactly like a quick reply falls back to its button text.
 * The blank predicate itself lives in `buttonParamContentChecks` — this set
 * only declares WHICH sub_types get omit-instead-of-send-blank treatment,
 * so the two can never drift.
 */
const OMIT_WHEN_BLANK_SUB_TYPES: ReadonlySet<string> = new Set([
  "quick_reply",
  "catalog",
])

const shouldOmitWhenBlank = (param: WaTemplateButtonParam): boolean =>
  OMIT_WHEN_BLANK_SUB_TYPES.has(buttonSubTypeOf(param)) &&
  !hasButtonParamContent(param)

type ResolvedButtonParam = {
  param: WaTemplateButtonParam
  /** Template button index, resolved from the entry's own array position when absent. */
  index: number
  hasExplicitIndex: boolean
}

const explicitIndexKey = (entry: ResolvedButtonParam): string =>
  `${buttonSubTypeOf(entry.param)}:${entry.index}`

/**
 * Collapses duplicate `(sub_type, index)` entries left behind by forms that
 * wrote at the wrong array slot, keeping the FIRST entry that carries content.
 * Entries without an explicit index keep today's positional behavior and are
 * never collapsed. The worker's `withQuickReplyButtonParams` relies on this
 * first-with-content tie-break: it removes legacy quick-reply entries at
 * indexes it re-binds, so change the winner rule here and there together.
 */
function dedupeExplicitIndexParams(
  entries: ResolvedButtonParam[],
): ResolvedButtonParam[] {
  const winners = new Map<string, ResolvedButtonParam>()

  for (const entry of entries) {
    if (!entry.hasExplicitIndex) {
      continue
    }
    const key = explicitIndexKey(entry)
    const current = winners.get(key)
    if (
      !current ||
      (!hasButtonParamContent(current.param) &&
        hasButtonParamContent(entry.param))
    ) {
      winners.set(key, entry)
    }
  }

  return entries.filter(
    (entry) =>
      !entry.hasExplicitIndex || winners.get(explicitIndexKey(entry)) === entry,
  )
}

/**
 * Normalizes persisted button params before they become Graph API components:
 * drops null holes from sparse form arrays, drops entries whose sub_type must
 * be omitted rather than sent blank (quick reply without a payload — Meta
 * rejects `payload: ""`; omitting the component makes the tap return the
 * button text instead — and catalog without a thumbnail, which falls back to
 * the catalog's own default when the component is left out), and collapses
 * legacy duplicates. Indexes are resolved from the ORIGINAL array positions
 * so removals never shift the positional fallback of the remaining entries.
 */
function resolveButtonParams(
  buttons: ReadonlyArray<WaTemplateButtonParam | null | undefined>,
): ResolvedButtonParam[] {
  const resolved = buttons.flatMap((param, position) =>
    param
      ? [
          {
            param,
            index: param.index ?? position,
            hasExplicitIndex: typeof param.index === "number",
          },
        ]
      : [],
  )

  const withoutOmittedBlanks = resolved.filter(
    (entry) => !shouldOmitWhenBlank(entry.param),
  )

  return dedupeExplicitIndexParams(withoutOmittedBlanks)
}

function buildButtonComponents(
  buttons: ReadonlyArray<WaTemplateButtonParam | null | undefined>,
  tokenContext: TemplateFlowTokenContext,
  cardIndex?: number,
): WhatsAppTemplateComponent[] {
  return resolveButtonParams(buttons).map(({ param, index }) => ({
    type: "button",
    sub_type: buttonSubTypeOf(param),
    index,
    parameters: [buildButtonParameter(param, tokenContext, cardIndex)],
  }))
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
