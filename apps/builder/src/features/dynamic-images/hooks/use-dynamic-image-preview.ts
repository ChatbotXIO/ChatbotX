"use client"

import { getPublicFileUrl } from "@chatbotx.io/utils"
import { useTenantSettings } from "@/features/tenant"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"
import { extractDynamicImageId } from "../lib/dynamic-image-url"
import type { DynamicImageResource } from "../schema/resource"

export type DynamicImagePreview = {
  url: string | undefined
  hasError: boolean
}

export const useDynamicImagePreview = (
  url: string | undefined,
): DynamicImagePreview => {
  const workspaceId = useWorkspaceId()
  const { storageUrl } = useTenantSettings()
  const dynamicImageId = extractDynamicImageId(url)
  const apiUrl = dynamicImageId
    ? `/api/workspaces/${workspaceId}/dynamic-images/${dynamicImageId}`
    : null
  const { data, error } = callAPI<DynamicImageResource>(apiUrl)

  if (dynamicImageId) {
    return {
      url: data?.backgroundUrl
        ? getPublicFileUrl(data.backgroundUrl, storageUrl)
        : undefined,
      hasError: Boolean(error),
    }
  }

  return { url: url?.startsWith("https") ? url : undefined, hasError: false }
}
