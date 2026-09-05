"use client"

import { getPublicFileUrl } from "@chatbotx.io/utils"
import { useQuery } from "@tanstack/react-query"
import { useTenantSettings } from "@/features/tenant"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { extractDynamicImageId } from "../lib/dynamic-image-url"

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
  const { data, isError } = useQuery(
    orpc.dynamicImagesAPI.getDynamicImageAPI.queryOptions({
      input: { workspaceId, id: dynamicImageId ?? "" },
      enabled: Boolean(dynamicImageId),
    }),
  )

  if (dynamicImageId) {
    return {
      url: data?.backgroundUrl
        ? getPublicFileUrl(data.backgroundUrl, storageUrl)
        : undefined,
      hasError: isError,
    }
  }

  return { url: url?.startsWith("https") ? url : undefined, hasError: false }
}
