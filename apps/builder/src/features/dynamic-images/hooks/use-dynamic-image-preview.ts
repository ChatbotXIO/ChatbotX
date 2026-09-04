"use client"

import { getPublicFileUrl } from "@chatbotx.io/utils"
import { useTenantSettings } from "@/features/tenant"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { useClientQuery } from "@/lib/swr"
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
  const { data, error } = useClientQuery(
    dynamicImageId
      ? ([
          "dynamicImagesAPI.getDynamicImageAPI",
          workspaceId,
          dynamicImageId,
        ] as const)
      : null,
    () =>
      client.dynamicImagesAPI.getDynamicImageAPI({
        workspaceId,
        id: dynamicImageId as string,
      }),
  )

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
