import { useState } from "react"
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

// Mirrors the media proxy's retry flag (`app/media/attachment/[token]/route.ts`).
const toRetryUrl = (fallbackUrl: string): string | undefined => {
  try {
    const url = new URL(fallbackUrl)
    url.searchParams.set("retry", "1")
    return url.toString()
  } catch {
    return
  }
}

type AttachmentSource = {
  url: string | undefined
  /**
   * Wire to the element's `onError` — for audio/video, to both the media
   * element (mid-playback failures) and its `<source>` (load failures). Calls
   * made against the same URL advance the chain only once.
   */
  onError: () => void
  /** True once the stored URL has failed and a fallback is being tried. */
  isRecovering: boolean
}

/**
 * An attachment's URL plus a load-failure handler that walks its recovery
 * chain: the stored URL, then the proxy fallback (a freshly signed storage
 * URL), then the fallback's retry form (the channel's own copy, for an object
 * evicted from storage). An attachment without a `fallbackUrl` never changes.
 */
export function useAttachmentSource(
  attachment?: AttachmentResource | null,
): AttachmentSource {
  const primaryUrl = useAttachmentUrl(attachment)
  const fallbackUrl = attachment?.fallbackUrl ?? undefined
  // Failures are counted against the URL they happened on, so a re-resolved
  // attachment (new `url`) starts its chain over.
  const [failed, setFailed] = useState({ url: primaryUrl, count: 0 })

  const candidates = [
    primaryUrl,
    ...(primaryUrl && fallbackUrl
      ? [fallbackUrl, toRetryUrl(fallbackUrl)].filter(
          (url): url is string => url !== undefined,
        )
      : []),
  ]
  const failures = failed.url === primaryUrl ? failed.count : 0
  const lastIndex = candidates.length - 1

  return {
    url: candidates[Math.min(failures, lastIndex)],
    // Sets an absolute count from this render's value, so the source and the
    // media element both reporting one failure still advance a single step.
    onError: () => {
      if (failures < lastIndex) {
        setFailed({ url: primaryUrl, count: failures + 1 })
      }
    },
    isRecovering: failures > 0,
  }
}
