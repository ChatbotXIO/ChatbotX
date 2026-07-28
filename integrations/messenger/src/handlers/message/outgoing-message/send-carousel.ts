import {
  cardLayouts,
  type SendCardStepSchema,
  type SendCarouselStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import type {
  FacebookImageAspectRatio,
  MessengerAuthValue,
} from "../../../schema"
import { getButtonTemplate } from "./send-button"

const MAX_CAROUSEL_ELEMENTS = 10

/**
 * The builder's orientation toggle sets how tall Messenger draws each card, not
 * how the cards are stacked — a generic template always scrolls horizontally.
 * Meta expresses that as a payload-level aspect ratio and accepts only
 * `horizontal` (1.91:1) or `square` (1:1), so the upright card is `square`.
 *
 * `layout` postdates the step, so carousels persisted before the field existed
 * keep the wide image they were authored with.
 */
const getImageAspectRatio = (
  layout: SendCarouselStepSchema["layout"],
): FacebookImageAspectRatio =>
  layout === cardLayouts.enum.vertical ? "square" : "horizontal"

export function* convertFlowStepCarousel(
  props: SendFlowStepProps<MessengerAuthValue, SendCarouselStepSchema>,
) {
  const {
    data: { step },
  } = props

  const chunks = chunk(step.cards, MAX_CAROUSEL_ELEMENTS)
  for (const chunk of chunks) {
    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          image_aspect_ratio: getImageAspectRatio(step.layout),
          elements: chunk.map((card: SendCardStepSchema) => ({
            title: card.title,
            subtitle: "subtitle" in card ? card.subtitle : undefined,
            image_url: "image" in card ? card.image?.url : undefined,
            buttons:
              "buttons" in card && card.buttons.length > 0
                ? card.buttons.map((button) =>
                    getButtonTemplate({
                      flowId: props.data.flowId,
                      flowVersionId: props.data.flowVersionId,
                      button,
                      metadata: props.data.metadata,
                      contactInboxId: props.data.contact.id,
                    }),
                  )
                : undefined,
          })),
        },
      },
    }
  }
}
