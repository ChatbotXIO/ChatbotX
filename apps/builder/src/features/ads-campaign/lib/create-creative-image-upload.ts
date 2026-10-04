import { fileService, resolveTenantSettings } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { fileContextTypes } from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import {
  buildMessagingAdCreativeStoragePrefix,
  MAX_MESSAGING_AD_IMAGE_BYTES,
  MESSAGING_AD_CREATIVE_UPLOAD_KIND,
  MESSAGING_AD_IMAGE_MIME_ALLOWLIST,
} from "@chatbotx.io/integration-facebook-ads"
import { createId } from "@chatbotx.io/utils"

const EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
}

export type AdsCreativeImageUpload = {
  fileId: string
  /** `creative.media.imageKey` for `ads.createCampaign`. */
  imageKey: string
  presignedPostUrl: string
  publicUrl: string
}

const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".")
  return dot > 0 ? fileName.slice(dot).toLowerCase() : ""
}

/**
 * Mints a pending `File` row and a presigned PUT URL for ONE ad-creative image
 * inside the workspace's ads-creative prefix, tagged so the create-time
 * preflight accepts it as ownership proof. The same checks the session route
 * applies (type allowlist, size cap, server-generated key); authorization is
 * the caller's (a super admin in the builder, the `ads` scope for a token).
 */
export async function createAdsCreativeImageUpload(input: {
  workspaceId: string
  userId: string | null
  fileName: string
  mimeType: string
  fileSize: number
}): Promise<AdsCreativeImageUpload> {
  const allowedExtensions = (
    MESSAGING_AD_IMAGE_MIME_ALLOWLIST as readonly string[]
  ).includes(input.mimeType)
    ? EXTENSIONS_BY_MIME[input.mimeType]
    : undefined
  const extension = extensionOf(input.fileName)
  if (!allowedExtensions?.includes(extension)) {
    throw new ChatbotXException(
      `Unsupported ad image: ${input.fileName} (${input.mimeType}). Use JPEG, PNG, GIF or WebP.`,
      "adsCreativeUnsupportedImage",
    )
  }
  if (input.fileSize > MAX_MESSAGING_AD_IMAGE_BYTES) {
    throw new ChatbotXException(
      `Ad images are limited to ${MAX_MESSAGING_AD_IMAGE_BYTES} bytes.`,
      "adsCreativeImageTooLarge",
    )
  }

  const imageKey = `${buildMessagingAdCreativeStoragePrefix(input.workspaceId)}/${createId()}${extension}`
  const [{ storageUrl }, presignedPostUrl] = await Promise.all([
    resolveTenantSettings({ workspaceId: input.workspaceId }),
    uploader.getPresignedUpload(imageKey),
  ])
  const file = await fileService.createPending({
    workspaceId: input.workspaceId,
    userId: input.userId,
    contextType: fileContextTypes.enum.generic,
    subType: MESSAGING_AD_CREATIVE_UPLOAD_KIND,
    path: imageKey,
    fileName: input.fileName,
    mimeType: input.mimeType,
  })
  return {
    fileId: file.id,
    imageKey,
    presignedPostUrl,
    publicUrl: new URL(imageKey, storageUrl).toString(),
  }
}
