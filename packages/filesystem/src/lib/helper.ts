import imageSize from "image-size"
import { uploaderLogger } from "./logger"
import type { UploadedFile } from "./schema"

// Helper function to join paths with a single separator, to avoid Edge Runtime issue
export const pathJoin = (...parts: string[]): string => {
  const sep = "/"
  return parts.join(sep).replace(new RegExp(`${sep}{1,}`, "g"), sep)
}

export function guessFileTypeFromMimeType(mimeType: string) {
  const prefix = mimeType.split("/")[0]

  switch (prefix) {
    case "image":
      return "image"
    case "video":
      return "video"
    case "audio":
      return "audio"
    default:
      return "file"
  }
}

export async function getImageDimensions(mimeType: string, buffer: Buffer) {
  const imageDimensions: Pick<
    UploadedFile,
    "mimeType" | "fileType" | "width" | "height"
  > = {
    mimeType,
    fileType: guessFileTypeFromMimeType(mimeType),
  }
  if (mimeType.startsWith("image/")) {
    // try to find image dimensions
    try {
      const { width, height } = await imageSize(new Uint8Array(buffer))
      imageDimensions.width = width
      imageDimensions.height = height
    } catch (error) {
      uploaderLogger.warn(error, "Unable to retrieve image dimensions")

      // force image to file
      imageDimensions.fileType = "file"
      imageDimensions.mimeType = "application/octet-stream"
    }
  }

  return imageDimensions
}

export const getStoragePrefix = (
  workspaceId: string,
  inboxId: string,
): string => {
  return `public/${workspaceId}/${inboxId}`
}
