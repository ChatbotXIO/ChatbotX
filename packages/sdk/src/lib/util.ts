import { FileType } from "./shared"

export function guessFileTypeFromMimeType(mimeType: string) {
  const prefix = mimeType.split("/")[0]

  switch (prefix) {
    case "image":
      return FileType.image
    case "video":
      return FileType.video
    case "audio":
      return FileType.audio
    default:
      return FileType.file
  }
}
