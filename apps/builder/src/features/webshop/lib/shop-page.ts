import "server-only"

import { webshopService } from "@chatbotx.io/business"
import type { SearchParams } from "next/dist/server/request/search-params"
import { loadShop } from "./load-shop"
import type { ShopSession } from "./shop-session"

export type ShopPageProps<Params extends Record<string, string>> = {
  params: Promise<Params & { workspaceId: string }>
  searchParams: Promise<SearchParams>
}

export const getParam = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value)

// Only bigint ids reach the database lookup.
const ID_PATTERN = /^\d{1,20}$/

export const asId = (value: string | undefined): string | null =>
  value && ID_PATTERN.test(value) ? value : null

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
  const loaded = await loadShop(
    params.workspaceId,
    getParam(searchParams.token),
  )
  if (!loaded) {
    return null
  }
  const cartCount = await countCart(loaded.session)
  return { ...loaded, params, searchParams, cartCount }
}

const countCart = async (session: ShopSession) =>
  session.mode === "customer"
    ? await webshopService.countCartItems(session.shopper)
    : 0
