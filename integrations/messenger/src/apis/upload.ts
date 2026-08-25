import { DEFAULT_API_VERSION } from "../constants"
import type { MessengerAuthValue } from "../schema"

type ResumableUploadImageOptions = {
  authenticatedDownload?: boolean
}

/**
 * Upload an image to Meta's Resumable Upload API for a specific Page.
 *
 * The `imageUrl` is the URL stored in a template's `header_handle[0]` field —
 * Meta returns a downloadable URL when listing templates. Handles are page-scoped,
 * so cloning requires re-uploading to each target page to get a fresh handle.
 *
 * PHP ref: UtilityMessageTemplateService::uploadImage + reuploadHeaderImage
 */
export async function resumableUploadImage(
  auth: MessengerAuthValue,
  imageUrl: string,
  options: ResumableUploadImageOptions = {},
): Promise<string> {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const appId = auth.clientId
  const accessToken = auth.tokens.accessToken
  const authenticatedDownload = options.authenticatedDownload ?? true

  // 1. Download image bytes from the stored handle URL
  const imgRes = await fetch(
    imageUrl,
    authenticatedDownload
      ? {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      : undefined,
  )
  if (!imgRes.ok) {
    throw new Error(`Template image download failed: HTTP ${imgRes.status}`)
  }
  const imgBuf = Buffer.from(await imgRes.arrayBuffer())
  const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg"
  if (!mimeType.startsWith("image/")) {
    throw new Error(
      `Header image must be an image file, got "${mimeType}" instead`,
    )
  }
  const fileName = new URL(imageUrl).pathname.split("/").pop() ?? "header.jpg"

  // 2. Create upload session — params as query string per Meta docs
  const sessionUrl = new URL(
    `https://graph.facebook.com/${version}/${appId}/uploads`,
  )
  sessionUrl.searchParams.set("file_name", fileName)
  sessionUrl.searchParams.set("file_length", String(imgBuf.byteLength))
  sessionUrl.searchParams.set("file_type", mimeType)
  sessionUrl.searchParams.set("access_token", accessToken)

  const sessionRes = await fetch(sessionUrl.toString(), { method: "POST" })
  if (!sessionRes.ok) {
    const body = await sessionRes.text().catch(() => "")
    throw new Error(
      `Upload session create failed: HTTP ${sessionRes.status} ${body}`,
    )
  }
  const { id: sessionId } = (await sessionRes.json()) as { id: string }

  // 3. Upload raw bytes — Meta expects `file_offset` header
  const uploadHeaders = new Headers({
    Authorization: `OAuth ${accessToken}`,
  })
  uploadHeaders.set("file_offset", "0")

  const uploadRes = await fetch(
    `https://graph.facebook.com/${version}/${sessionId}`,
    {
      method: "POST",
      headers: uploadHeaders,
      body: imgBuf,
    },
  )
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "")
    throw new Error(`Image upload failed: HTTP ${uploadRes.status} ${body}`)
  }
  const { h } = (await uploadRes.json()) as { h: string }
  return h
}
