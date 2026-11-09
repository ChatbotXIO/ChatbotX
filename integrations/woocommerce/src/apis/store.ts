import ky from "ky"
import { z } from "zod"
import { type WooCommerceCredentials, woocommerceRequest } from "../client"
import { WOOCOMMERCE_HTTP_TIMEOUT_MS } from "../constants"
import { WooCommerceApiError } from "../error"

const currencySchema = z.object({
  code: z.string().min(1),
  symbol: z.string().nullish(),
})

const settingSchema = z.object({ value: z.unknown() })

const siteIndexSchema = z.object({ name: z.string().optional() }).loose()

/** WooCommerce's `woocommerce_currency_pos` values, in our spelling. */
const CURRENCY_POSITIONS = {
  left: "left",
  right: "right",
  left_space: "leftSpace",
  right_space: "rightSpace",
} as const

export type WooCommerceCurrencyPosition =
  (typeof CURRENCY_POSITIONS)[keyof typeof CURRENCY_POSITIONS]

export type WooCommerceStoreInfo = {
  name: string | null
  /** ISO 4217, upper case. */
  currency: string
  /** As the store shows it, e.g. `₫`; null when it has none. */
  currencySymbol: string | null
  /** Null when the key may not read the store's settings. */
  currencyPosition: WooCommerceCurrencyPosition | null
}

const HTML_ENTITY = /&#(x[0-9a-f]+|\d+);|&([a-z]+);/gi
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
}

/** WooCommerce sends symbols as HTML entities, e.g. `&#8363;` for `₫`. */
export const decodeHtmlEntities = (value: string) =>
  value.replace(HTML_ENTITY, (entity, code: string | undefined, name) => {
    if (code) {
      const point = code.startsWith("x")
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    return NAMED_ENTITIES[String(name).toLowerCase()] ?? entity
  })

const readCurrencyPosition = async (
  credentials: WooCommerceCredentials,
): Promise<WooCommerceCurrencyPosition | null> => {
  try {
    const { data } = await woocommerceRequest(
      credentials,
      { method: "get", path: "/settings/general/woocommerce_currency_pos" },
      settingSchema,
    )
    return typeof data.value === "string" && data.value in CURRENCY_POSITIONS
      ? CURRENCY_POSITIONS[data.value as keyof typeof CURRENCY_POSITIONS]
      : null
  } catch (error) {
    // A key whose user may not manage the store's settings still sells.
    if (error instanceof WooCommerceApiError && error.statusCode < 500) {
      return null
    }
    throw error
  }
}

/**
 * The store's currency as it shows prices — code, symbol and where the
 * symbol goes — read with the keys, so it also proves they work, and the
 * site's name from WordPress's public REST index (best effort).
 */
export async function getWooCommerceStoreInfo(
  credentials: WooCommerceCredentials,
): Promise<WooCommerceStoreInfo> {
  const { data } = await woocommerceRequest(
    credentials,
    { method: "get", path: "/data/currencies/current" },
    currencySchema,
  )
  const currencyPosition = await readCurrencyPosition(credentials)
  let name: string | null = null
  try {
    const response = await ky.get(`${credentials.siteUrl}/wp-json/`, {
      searchParams: { _fields: "name" },
      redirect: "manual",
      retry: 0,
      timeout: WOOCOMMERCE_HTTP_TIMEOUT_MS,
    })
    name = siteIndexSchema.parse(await response.json()).name?.trim() || null
  } catch {
    // The name is only shown in the settings; the store works without it.
  }
  const symbol = data.symbol ? decodeHtmlEntities(data.symbol).trim() : ""
  return {
    name,
    currency: data.code.toUpperCase(),
    currencySymbol: symbol || null,
    currencyPosition,
  }
}
