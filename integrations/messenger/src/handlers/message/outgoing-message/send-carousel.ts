import type { SendCarouselStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import type { MessengerAuthValue } from "../../../schema"
import { getButtonTemplate } from "./send-button"

const MAX_CAROUSEL_ELEMENTS = 10

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
          elements: chunk.map((card) => ({
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
                    }),
                  )
                : undefined,
          })),
        },
      },
    }
  }
}
