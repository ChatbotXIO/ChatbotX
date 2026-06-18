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
