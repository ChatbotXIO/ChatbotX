import "server-only"

import { webshopService } from "@chatbotx.io/business"
import type { SearchParams } from "next/dist/server/request/search-params"
import { getTranslations } from "next-intl/server"
import { loadShop, type ShopView } from "./load-shop"
import { countPreviewCartItems, readPreviewCart } from "./preview-cart"
import type { ShopSession } from "./shop-session"

export type ShopPageProps<Params extends Record<string, string>> = {
  params: Promise<Params & { workspaceId: string }>
  searchParams: Promise<SearchParams>
}

export const getParam = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value)

/**
 * The signed shop token of a page's URL. A payment provider sends the
 * customer back with `shopToken`: PayPal appends its own `token` (its order
 * id) to the return URL, which must never be read as ours.
 */
export const getShopToken = (searchParams: SearchParams): string | undefined =>
  getParam(searchParams.shopToken) ?? getParam(searchParams.token)

// Only bigint ids reach the database lookup.
const ID_PATTERN = /^\d{1,20}$/

export const asId = (value: string | undefined): string | null =>
  value && ID_PATTERN.test(value) ? value : null

// A bot's search hits; a link with more is not one the shop made.
const MAX_LINKED_PRODUCTS = 20

/** `products=1,2,3` — the valid ids, at most `MAX_LINKED_PRODUCTS`. */
export const asIdList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .flatMap((part) => asId(part.trim()) ?? [])
    .slice(0, MAX_LINKED_PRODUCTS)

/**
 * What every shop page starts with: the store, who is shopping and how many
 * items their cart holds. `null` when the link is not valid.
 */
export async function loadShopPage<Params extends Record<string, string>>(
  props: ShopPageProps<Params>,
) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])
  const loaded = await loadShop(params.workspaceId, getShopToken(searchParams))
  if (!loaded) {
    return null
  }
  const cartCount = await countCart(loaded.session)
  return { ...loaded, params, searchParams, cartCount }
}

/**
 * The shop's strings in the workspace language. Without a valid link there is
 * no workspace to ask, so they fall back to the viewer's own language.
 */
export const getShopTranslations = async (
  shop: Pick<ShopView, "locale"> | undefined,
) =>
  shop
    ? await getTranslations({ locale: shop.locale, namespace: "webshop" })
    : await getTranslations("webshop")

/** For `generateMetadata`: the same strings, without counting the cart. */
export async function getShopPageTranslations<
  Params extends Record<string, string>,
>(props: ShopPageProps<Params>) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])
  const loaded = await loadShop(params.workspaceId, getShopToken(searchParams))
  return await getShopTranslations(loaded?.shop)
}

const countCart = async (session: ShopSession) =>
  session.mode === "customer"
    ? await webshopService.countCartItems(session.shopper)
    : countPreviewCartItems(await readPreviewCart(session.workspaceId))
