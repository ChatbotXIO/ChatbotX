import { FileType } from "./shared"

export function guessFileTypeFromMimeType(mimeType: string) {
  const prefix = mimeType.split("/")[0]

  switch (prefix) {
    case "image":
      return FileType.IMAGE
    case "video":
      return FileType.VIDEO
    case "audio":
      return FileType.AUDIO
    default:
      return FileType.DOCUMENT
  }
}
