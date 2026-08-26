import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import type { AdVideoStatus, UploadAdVideoInput } from "../messaging-ads/types"

const advideosResponseSchema = z.object({ id: z.string().trim().min(1) })

/**
 * `POST /act_{adAccount}/advideos` (multipart, field name `source`) — returns
 * a `video_id` immediately, but processing is ASYNC. Callers MUST poll
 * `getAdVideoStatus` until `isReady` before referencing the video in a
 * creative (out/plan/ctm-ctid-ads-manager.md "Media upload"). Phase 1 uses a
 * simple multipart upload (adequate for admin-initiated, low-volume ad
 * creation) rather than Meta's chunked/resumable Upload API for very large
 * files.
 */
export function uploadAdVideo({
  accessToken,
  adAccountId,
  fileName,
  bytes,
  mimeType,
  version = DEFAULT_API_VERSION,
}: UploadAdVideoInput): Promise<{ videoId: string }> {
  const endpoint = `${version}/${adAccountId}/advideos`

  return rescue(endpoint, async () => {
    const form = new FormData()
    form.append(
      "source",
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
      fileName,
    )

    const response = await facebookAdsGraphClient.postForm<unknown>(endpoint, {
      searchParams: { access_token: accessToken },
      body: form,
    })

    const parsed = advideosResponseSchema.parse(response)
    return { videoId: parsed.id }
  })
}

const videoStatusResponseSchema = z.object({
  id: z.string(),
  status: z
    .object({
      video_status: z.string().optional(),
    })
    .optional(),
})

const READY_STATUSES = new Set(["ready"])
const ERROR_STATUSES = new Set(["error"])

/** `GET /{video_id}?fields=status` — the polling contract every creative-create must satisfy first. */
export function getAdVideoStatus(input: {
  accessToken: string
  videoId: string
  version?: string
}): Promise<AdVideoStatus> {
  const { accessToken, videoId, version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${videoId}`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: { fields: "status", access_token: accessToken },
    })
    const parsed = videoStatusResponseSchema.parse(response)
    const videoStatus = parsed.status?.video_status ?? "processing"
    return {
      videoId: parsed.id,
      status: videoStatus,
      isReady: READY_STATUSES.has(videoStatus),
      isError: ERROR_STATUSES.has(videoStatus),
    }
  })
}
