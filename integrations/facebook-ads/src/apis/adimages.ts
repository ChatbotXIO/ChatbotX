import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import type { UploadAdImageInput } from "../messaging-ads/types"

/**
 * `POST /act_{adAccount}/adimages` (multipart). Meta's response is KEYED BY
 * THE UPLOADED FILENAME — `{ images: { "<filename>": { hash } } }` — never a
 * flat `{ hash }` field (out/plan/ctm-ctid-ads-manager.md "Media upload").
 * The multipart form field NAME must equal the filename Meta echoes back as
 * the response key, so the caller-supplied `fileName` is used for both.
 */
const adImagesResponseSchema = z.object({
  images: z.record(z.string(), z.object({ hash: z.string().trim().min(1) })),
})

export function uploadAdImage({
  accessToken,
  adAccountId,
  fileName,
  bytes,
  mimeType,
  version = DEFAULT_API_VERSION,
}: UploadAdImageInput): Promise<{ imageHash: string }> {
  const endpoint = `${version}/${adAccountId}/adimages`

  return rescue(endpoint, async () => {
    const form = new FormData()
    form.append(
      fileName,
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
      fileName,
    )

    const response = await facebookAdsGraphClient.postForm<unknown>(endpoint, {
      searchParams: { access_token: accessToken },
      body: form,
    })

    const parsed = adImagesResponseSchema.parse(response)
    const hash = parsed.images[fileName]?.hash
    if (!hash) {
      throw new Error(
        `Facebook adimages response did not include a hash for filename "${fileName}"`,
      )
    }
    return { imageHash: hash }
  })
}
