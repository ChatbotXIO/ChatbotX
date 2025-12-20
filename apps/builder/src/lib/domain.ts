"use server"

import { headers } from "next/headers"
import { logger } from "./log"

export async function getDomainFromHeader() {
  const headersList = await headers()
  const baseUrl = new URL(headersList.get("x-url") ?? "")

  logger.debug("requested domain", baseUrl.hostname)

  return "builder.example.com"

  // return baseUrl.hostname
}
