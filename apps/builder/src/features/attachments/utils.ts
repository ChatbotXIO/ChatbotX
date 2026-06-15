import { useTenantSettings } from "@/features/tenant"
import type { AttachmentResource } from "./schema/resource"

export function useAttachmentUrl(
  attachment?: AttachmentResource | null,
): string | undefined {
  const { storageUrl } = useTenantSettings()

  if (!attachment) {
    return
  }

  if (attachment.url) {
    return attachment.url
  }

  if (attachment.url === null) {
    return
  }

  try {
    return new URL(attachment.originPath, storageUrl).toString()
  } catch (error) {
    console.error("Error getting attachment URL", error)
    return
  }
}
