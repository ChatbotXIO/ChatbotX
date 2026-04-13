"use client"

import { env } from "@/env"

const stripTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value

export const getMagicLinkPublicUrl = (
  workspaceId: string,
  name: string,
): string => {
  const base = stripTrailingSlash(env.NEXT_PUBLIC_BUILDER_URL)
  return `${base}/r/${workspaceId}/${encodeURIComponent(name)}`
}
