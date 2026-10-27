import {
  productCategoryRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import {
  SHOP_PREVIEW_TOKEN_TTL_MS,
  SHOP_TOKEN_TTL_MS,
  signShopPreviewToken,
  signShopToken,
} from "@chatbotx.io/encryption/shop-token"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import { notFoundException } from "../errors"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import { vendorService } from "../vendor/service"

/** The shop page a link opens. */
export type WebshopLinkTarget = {
  /** `cart` opens the cart, ready to check out; omitted opens the shop. */
  page?: "cart"
  /** Opens this product's page (instead of `page`). */
  productId?: string | null
  /** Opens the shop searching for this. */
  keyword?: string | null
  /** Opens the shop listing just these products (a message's search hits). */
  productIds?: string[] | null
  vendorId?: string | null
  categoryId?: string | null
}

/** `/products/<id>`, `/cart` or the shop's front page. */
const pagePath = (target: WebshopLinkTarget): string => {
  if (target.productId) {
    return `/products/${encodeURIComponent(target.productId)}`
  }
  return target.page ? `/${target.page}` : ""
}

/**
 * The shop URL for `token`. `token` may be the literal `{{shop_token}}`, which
 * a flow send resolves for the contact it is sent to, so it is placed into the
 * query string as is.
 */
export const buildWebshopUrl = (
  input: WebshopLinkTarget & {
    appUrl: string
    workspaceId: string
    token: string
  },
): string => {
  const page = pagePath(input)
  const path = `/shop/${encodeURIComponent(input.workspaceId)}${page}`
  const query = [
    `token=${input.token}`,
    ...(input.vendorId ? [`vendor=${encodeURIComponent(input.vendorId)}`] : []),
    ...(input.categoryId
      ? [`category=${encodeURIComponent(input.categoryId)}`]
      : []),
    ...(input.keyword ? [`q=${encodeURIComponent(input.keyword)}`] : []),
    ...(input.productIds?.length
      ? [`products=${input.productIds.map(encodeURIComponent).join(",")}`]
      : []),
  ].join("&")
  return joinAppUrl(input.appUrl, `${path}?${query}`)
}

/**
 * A ready link on the workspace's own app domain (white-label aware), plus
 * the same page as a bot-button link (`buttonUrl`, signed at send time for
 * whoever receives it). `url` is signed
 * for `contactId` so the cart and the order are that contact's, or a preview
 * — browsable, never orderable — when no contact is given.
 */
export const createWebshopLink = async (
  input: WebshopLinkTarget & {
    workspaceId: string
    contactId?: string | null
    contactInboxId?: string | null
  },
): Promise<{
  url: string
  buttonUrl: string
  preview: boolean
  expiresInSeconds: number
}> => {
  if (input.vendorId) {
    await vendorService.assertBelongsToWorkspace({
      workspaceId: input.workspaceId,
      vendorId: input.vendorId,
    })
  }
  if (
    input.categoryId &&
    !(await productCategoryRepository.find({
      workspaceId: input.workspaceId,
      categoryId: input.categoryId,
    }))
  ) {
    throw notFoundException("Product category does not exist.")
  }
  if (
    input.productId &&
    !(await productRepository.find({
      workspaceId: input.workspaceId,
      productId: input.productId,
    }))
  ) {
    throw notFoundException("Product does not exist.")
  }
  const appUrl = await resolveWorkspaceAppUrl({
    workspaceId: input.workspaceId,
  })
  const preview = !input.contactId
  const token = input.contactId
    ? await signShopToken({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        contactInboxId: input.contactInboxId ?? null,
        conversationId: null,
      })
    : await signShopPreviewToken(input.workspaceId)
  return {
    url: buildWebshopUrl({ ...input, appUrl, token }),
    buttonUrl: buildWebshopButtonUrl({ ...input, appUrl }),
    preview,
    expiresInSeconds:
      (preview ? SHOP_PREVIEW_TOKEN_TTL_MS : SHOP_TOKEN_TTL_MS) / 1000,
  }
}

/** A link a bot button carries: `{{shop_token}}` is signed at send time. */
export const buildWebshopButtonUrl = (
  input: WebshopLinkTarget & { appUrl: string; workspaceId: string },
): string => buildWebshopUrl({ ...input, token: "{{shop_token}}" })
