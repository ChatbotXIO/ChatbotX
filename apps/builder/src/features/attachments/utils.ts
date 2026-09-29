import { useTenantSettings } from "@/features/tenant"
import type { AttachmentResource } from "./schema/resource"

export function useAttachmentUrl(
  attachment?: AttachmentResource | null,
): string | undefined {
  const { storageUrl } = useTenantSettings()

  if (!attachment) {
    return
  }

  // A server-resolved null is terminal; only legacy undefined shapes fall back.
  if (attachment.url !== undefined) {
    return attachment.url ?? undefined
  }

  if (attachment.originPath === null) {
    return
  }

  try {
    return new URL(attachment.originPath, storageUrl).toString()
  } catch (error) {
    console.error("Error getting attachment URL", error)
    return
  }
}
