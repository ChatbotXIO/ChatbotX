import { usePlatformUrls } from "@/features/platform"
import type { AttachmentResource } from "./schema/resource"

export function useAttachmentUrl(
  attachment?: AttachmentResource | null,
): string | undefined {
  const { assetUrl } = usePlatformUrls()

  if (!attachment) {
    return
  }

  if (attachment.url) {
    return attachment.url
  }

  try {
    return new URL(attachment.originPath, assetUrl).toString()
  } catch (error) {
    console.error("Error getting attachment URL", error)
    return
  }
}
