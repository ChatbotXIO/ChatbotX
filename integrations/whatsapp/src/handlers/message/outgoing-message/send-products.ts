import type {
  MessageHandlers,
  ProductMessageItem,
  ResolvedProductMessage,
} from "@chatbotx.io/sdk"
import type {
  InteractiveCatalogMessage,
  InteractiveProductCarouselMessage,
  InteractiveProductListMessage,
  InteractiveProductMessage,
  RawWhatsappMessage,
  WhatsappAuthValue,
} from "../../../schema"

type ProductsMessage = Extract<ResolvedProductMessage, { display: "products" }>
type CarouselMessage = Extract<ResolvedProductMessage, { display: "carousel" }>
type CatalogMessage = Extract<ResolvedProductMessage, { display: "catalog" }>

/**
 * Meta addresses a product by its catalog id plus its retailer id. A message's
 * products all come from the one catalog the business connected, which the
 * business layer resolved them against.
 */
const catalogIdOf = (items: readonly ProductMessageItem[]): string => {
  const catalogId = items[0]?.catalogReference.catalogId
  if (!catalogId) {
    throw new Error("A WhatsApp product message needs at least one product")
  }
  return catalogId
}

const toProductMessage = (
  item: ProductMessageItem,
  message: ProductsMessage,
): InteractiveProductMessage => ({
  _type: "interactive_product",
  type: "interactive",
  interactive: {
    type: "product",
    ...(message.body ? { body: { text: message.body } } : {}),
    ...(message.footer ? { footer: { text: message.footer } } : {}),
    action: {
      catalog_id: item.catalogReference.catalogId,
      product_retailer_id: item.catalogReference.retailerId,
    },
  },
})

const toProductListMessage = (
  message: ProductsMessage,
  items: readonly ProductMessageItem[],
): InteractiveProductListMessage => {
  if (!(message.header && message.body)) {
    throw new Error(
      "A WhatsApp multi-product message needs a header and a body",
    )
  }
  return {
    _type: "interactive_product_list",
    type: "interactive",
    interactive: {
      type: "product_list",
      header: { type: "text", text: message.header },
      body: { text: message.body },
      ...(message.footer ? { footer: { text: message.footer } } : {}),
      action: {
        catalog_id: catalogIdOf(items),
        sections: message.sections.map((section) => ({
          ...(section.title ? { title: section.title } : {}),
          product_items: section.items.map((item) => ({
            product_retailer_id: item.catalogReference.retailerId,
          })),
        })),
      },
    },
  }
}

const convertProducts = (message: ProductsMessage): RawWhatsappMessage => {
  const items = message.sections.flatMap((section) => section.items)
  const [onlyItem] = items
  return items.length === 1 && onlyItem
    ? toProductMessage(onlyItem, message)
    : toProductListMessage(message, items)
}

const convertCarousel = (
  message: CarouselMessage,
): InteractiveProductCarouselMessage => {
  const catalogId = catalogIdOf(message.items)
  return {
    _type: "interactive_product_carousel",
    type: "interactive",
    interactive: {
      type: "carousel",
      body: { text: message.body },
      action: {
        cards: message.items.map((item, cardIndex) => ({
          card_index: cardIndex,
          type: "product",
          action: {
            product_retailer_id: item.catalogReference.retailerId,
            catalog_id: catalogId,
          },
        })),
      },
    },
  }
}

const convertCatalog = (
  message: CatalogMessage,
): InteractiveCatalogMessage => ({
  _type: "interactive_catalog",
  type: "interactive",
  interactive: {
    type: "catalog_message",
    body: { text: message.body },
    ...(message.footer ? { footer: { text: message.footer } } : {}),
    action: {
      name: "catalog_message",
      ...(message.thumbnail
        ? {
            parameters: {
              thumbnail_product_retailer_id:
                message.thumbnail.catalogReference.retailerId,
            },
          }
        : {}),
    },
  },
})

const toWhatsappProductMessage = (
  message: ResolvedProductMessage,
): RawWhatsappMessage => {
  switch (message.display) {
    case "products":
      return convertProducts(message)
    case "carousel":
      return convertCarousel(message)
    case "catalog":
      return convertCatalog(message)
    default: {
      const unreachable: never = message
      throw new Error(
        `Unsupported product message: ${JSON.stringify(unreachable)}`,
      )
    }
  }
}

/**
 * Converts a resolved `sendProducts` step into one of Meta's catalog
 * interactives. The text limits were enforced when the step was published and
 * again when it was resolved, so nothing is truncated here: a message that
 * would not fit is rejected before it reaches this point.
 */
export function* convertFlowStepSendProducts(
  props: Parameters<MessageHandlers<WhatsappAuthValue>["sendFlowStep"]>[0],
): Generator<RawWhatsappMessage> {
  const { productMessage } = props.data
  if (!productMessage) {
    throw new Error(
      "sendProducts reached the WhatsApp handler without resolved products",
    )
  }
  yield toWhatsappProductMessage(productMessage)
}
