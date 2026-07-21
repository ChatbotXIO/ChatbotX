import "server-only"
import { headers } from "next/headers"
import { logger } from "./log"

export async function getDomainFromHeader() {
  const headersList = await headers()
  const domain = headersList.get("x-domain") ?? ""
  logger.debug(`requested domain: ${domain}`)

  return domain
}

export async function getOriginUrlFromHeader() {
  const headersList = await headers()
  const originUrl = headersList.get("x-url") ?? ""

  return originUrl
}

/**
 * `x-url` (see `getOriginUrlFromHeader`) carries the full current request URL
 * — path and query included — not just the origin its name suggests. OAuth
 * "referer" fallbacks (the page to land on when the flow started with no
 * workspace yet) must be the app's origin only: using the raw header value
 * there sends the user back to the exact page that kicked off the OAuth
 * redirect (e.g. `/channels/create?channel=tiktok`), which immediately
 * re-triggers the same redirect and loops the user back to the provider.
 */
export async function getOriginFromHeader() {
  const originUrl = await getOriginUrlFromHeader()
  return originUrl ? new URL(originUrl).origin : ""
}
