import type { EcommerceSettings } from "@chatbotx.io/database/partials"
import { productRepository } from "@chatbotx.io/database/repositories"
import { signShopToken } from "@chatbotx.io/encryption/shop-token"
import {
  buttonTypes,
  COLLECTION_MAX_PRODUCTS,
  type SendCardStepSchema,
  type SendCollectionStepSchema,
  stepTypes,
  uploadModes,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  computeLinePrice,
  formatMoney,
  stackDiscountPercents,
} from "@chatbotx.io/utils/money"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import {
  type CustomerMessageLanguage,
  customerMessageStrings,
} from "../order/customer-messages"
import { resolveCustomerMessageLanguage } from "../order/message-language"
import { resolveTenantSettings } from "../platform/settings"
import { buildWebshopUrl } from "./link"

const CARD_TEXT_MAX = 80

const truncate = (text: string, max = CARD_TEXT_MAX) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`

type ShopProductRow = Awaited<
  ReturnType<typeof productRepository.listForShop>
>["data"][number]

/** The products a collection step sends: what the shop shows, at most 10. */
export async function listCollectionProducts(input: {
  workspaceId: string
  step: Pick<
    SendCollectionStepSchema,
    "collectionType" | "conditions" | "productIds"
  >
}): Promise<ShopProductRow[]> {
  const { step } = input
  if (step.collectionType === "manual") {
    if (step.productIds.length === 0) {
      return []
    }
    const { data } = await productRepository.listForShop({
      workspaceId: input.workspaceId,
      productIds: step.productIds,
    })
    // In the order they were chosen.
    const byId = new Map(data.map((product) => [product.id, product]))
    return step.productIds
      .flatMap((id) => byId.get(id) ?? [])
      .slice(0, COLLECTION_MAX_PRODUCTS)
  }
  const { conditions } = step
  const { data } = await productRepository.listForShop({
    workspaceId: input.workspaceId,
    keyword: conditions.name.trim() || null,
    categoryId: conditions.subcategoryId ?? conditions.categoryId,
    vendorId: conditions.vendorId,
    page: 1,
    perPage: COLLECTION_MAX_PRODUCTS,
  })
  return data
}

const linkButton = (label: string, url: string) => ({
  id: createId(),
  label,
  buttonType: buttonTypes.enum.openWebsite,
  beforeStep: {
    id: createId(),
    stepType: stepTypes.enum.openWebsite,
    url,
    browserSize: 100 as const,
  },
  steps: [],
})

/** The price the cart charges for one: the product's and vendor's discounts stacked. */
const priceText = (product: ShopProductRow, settings: EcommerceSettings) => {
  const { gross, discountTotal } = computeLinePrice({
    unitPrice: product.price,
    quantity: 1,
    discountPercent: stackDiscountPercents(
      product.discount,
      product.vendorDiscountPercent,
    ),
    currency: settings.payments.currency,
  })
  return formatMoney(gross - discountTotal, {
    currency: settings.payments.currency,
    symbol: settings.payments.currencySymbol,
    position: settings.payments.currencyPosition,
  })
}

/**
 * The carousel cards of a collection step for one send: a card per product
 * (image, name, price and vendor), with buttons per the store's "Buttons in
 * Products" — View (the product page, or its own page with the "visit the
 * external product page" checkout) and Similar (its category). Links carry
 * `shopToken`, the receiving contact's signed shop token.
 */
export async function buildCollectionCards(input: {
  workspaceId: string
  step: Pick<
    SendCollectionStepSchema,
    "collectionType" | "conditions" | "productIds"
  >
  appUrl: string
  shopToken: string
  language: CustomerMessageLanguage
}): Promise<SendCardStepSchema[]> {
  const [products, settings] = await Promise.all([
    listCollectionProducts(input),
    ecommerceSettingsService.get(input.workspaceId),
  ])
  const labels = customerMessageStrings(input.language).collection
  const buttons = new Set(settings.general.productButtons)
  const externalPage = settings.checkout.checkoutMode === "productPage"

  return products.map((product) => {
    const productUrl =
      externalPage && product.productUrl
        ? product.productUrl
        : buildWebshopUrl({
            appUrl: input.appUrl,
            workspaceId: input.workspaceId,
            token: input.shopToken,
            productId: product.id,
          })
    const cardButtons = [
      linkButton(externalPage ? labels.buy : labels.view, productUrl),
      ...(buttons.has("similar") && product.categoryId
        ? [
            linkButton(
              labels.similar,
              buildWebshopUrl({
                appUrl: input.appUrl,
                workspaceId: input.workspaceId,
                token: input.shopToken,
                categoryId: product.categoryId,
              }),
            ),
          ]
        : []),
    ]
    const imageUrl = product.images[0]?.url
    return {
      id: createId(),
      stepType: stepTypes.enum.sendCard,
      title: truncate(product.name),
      subtitle: truncate(
        [priceText(product, settings), product.vendor]
          .filter(Boolean)
          .join(" · "),
      ),
      ...(imageUrl
        ? {
            image: {
              id: createId(),
              stepType: stepTypes.enum.sendImage,
              mode: uploadModes.enum.url,
              url: imageUrl,
              buttons: [],
            },
          }
        : {}),
      buttons: cardButtons,
    }
  })
}

/**
 * The collection step as it is sent to one contact: its product cards, on
 * the workspace's own app domain, labelled in the contact's language, their
 * links signed for the contact. Null when no product matches — the step is
 * then skipped rather than sent empty. Called after the step's variables are
 * resolved: product names are the merchant's data, not flow copy, so they
 * never go through variables or spintax.
 */
export async function resolveCollectionStep<
  Step extends Pick<
    SendCollectionStepSchema,
    "collectionType" | "conditions" | "productIds"
  >,
>(input: {
  workspaceId: string
  contactId: string
  contactInboxId?: string | null
  step: Step
}): Promise<(Step & { cards: SendCardStepSchema[] }) | null> {
  const [{ appUrl }, language, shopToken] = await Promise.all([
    resolveTenantSettings({ workspaceId: input.workspaceId }),
    resolveCustomerMessageLanguage(input),
    signShopToken({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      contactInboxId: input.contactInboxId ?? null,
      conversationId: null,
    }),
  ])
  const cards = await buildCollectionCards({
    workspaceId: input.workspaceId,
    step: input.step,
    appUrl,
    shopToken,
    language,
  })
  return cards.length > 0 ? { ...input.step, cards } : null
}
