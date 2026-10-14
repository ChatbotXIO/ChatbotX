import {
  evaluateProductMessage,
  type ProductMessageCapability,
  type ProductMessageShape,
  type SendProductsContent,
  type SendProductsDisplay,
  toProductMessageShape,
} from "@chatbotx.io/flow-config"
import type {
  ProductMessageItem,
  ResolvedProductMessage,
} from "@chatbotx.io/sdk"

export type MissingProduct = { productId: string }

type DraftSection = { title?: string; items: ProductMessageItem[] }

/** The message as it would be sent, before it is shaped into its display. */
type Draft = {
  display: SendProductsDisplay
  header?: string
  body?: string
  footer?: string
  sections: DraftSection[]
}

export type ProductMessageResolution =
  | { ok: true; message: ResolvedProductMessage; missing: MissingProduct[] }
  | { ok: false; reason: "noProductsSendable" | "invalidMessage" }

const textFields = ["header", "body", "footer"] as const

const toResolvedMessage: Record<
  SendProductsDisplay,
  (draft: Draft) => ResolvedProductMessage
> = {
  products: (draft) => ({
    display: "products",
    header: draft.header,
    body: draft.body,
    footer: draft.footer,
    sections: draft.sections,
  }),
  carousel: (draft) => ({
    display: "carousel",
    body: draft.body ?? "",
    items: draft.sections.flatMap((section) => section.items),
  }),
}

const textOrUndefined = (value: string | undefined) =>
  value?.trim() || undefined

export const collectProductIds = (content: SendProductsContent): string[] =>
  content.sections.flatMap((section) => section.productIds)

const draftToShape = (draft: Draft): ProductMessageShape => ({
  display: draft.display,
  header: draft.header,
  body: draft.body,
  footer: draft.footer,
  sections: draft.sections.map((section) => ({
    title: section.title,
    productCount: section.items.length,
  })),
})

/**
 * Dropping products can only relax what a message requires, never add to it,
 * but it can make a field it carried no longer allowed — a header on a message
 * that shrank to one product. Those are omitted rather than failing the send;
 * everything else the evaluator objects to means the message cannot be sent.
 */
const withoutFieldsNoLongerAllowed = (
  capability: ProductMessageCapability,
  draft: Draft,
): Draft => {
  const notAllowed = new Set(
    evaluateProductMessage(capability, draftToShape(draft)).flatMap((issue) =>
      issue.code === "sendProductsFieldNotAllowed" && issue.path.length === 1
        ? [String(issue.path[0])]
        : [],
    ),
  )
  return {
    ...draft,
    ...Object.fromEntries(
      textFields
        .filter((field) => notAllowed.has(field))
        .map((field) => [field, undefined]),
    ),
  }
}

/**
 * Pure: turns a product message plus the products that turned out to be sendable into the
 * message to dispatch. Order and sections follow the author's; products that
 * are not sendable are reported, never replaced.
 */
export const resolveProductMessage = (props: {
  capability: ProductMessageCapability
  content: SendProductsContent
  sendableById: ReadonlyMap<string, ProductMessageItem>
}): ProductMessageResolution => {
  const { capability, content, sendableById } = props

  // A message that is invalid as authored (raw graph, legacy data) must fail, not
  // be repaired. Only what shrinking the product list causes may be adjusted.
  if (
    evaluateProductMessage(capability, toProductMessageShape(content)).length >
    0
  ) {
    return { ok: false, reason: "invalidMessage" }
  }

  const sections = content.sections
    .map((section) => ({
      title: textOrUndefined(section.title),
      items: section.productIds.flatMap((productId) => {
        const item = sendableById.get(productId)
        return item ? [item] : []
      }),
    }))
    .filter((section) => section.items.length > 0)

  const draft = withoutFieldsNoLongerAllowed(capability, {
    display: content.display,
    header: textOrUndefined(content.header),
    body: textOrUndefined(content.body),
    footer: textOrUndefined(content.footer),
    sections,
  })

  // The message was valid as authored, so what is left to fail is the catalog:
  // too few of its products are sendable any more.
  if (evaluateProductMessage(capability, draftToShape(draft)).length > 0) {
    return { ok: false, reason: "noProductsSendable" }
  }

  return {
    ok: true,
    message: toResolvedMessage[content.display](draft),
    missing: collectProductIds(content)
      .filter((productId) => !sendableById.has(productId))
      .map((productId) => ({ productId })),
  }
}
