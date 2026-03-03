export function guessFileTypeFromMimeType(mimeType: string) {
  const prefix = mimeType.split("/")[0]

  switch (prefix) {
    case "image":
    case "video":
    case "audio":
      return prefix
    default:
      return "file"
  }
}
