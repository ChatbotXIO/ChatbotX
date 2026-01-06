import { lookup as lookupMimeType } from "mime-types"

export const getMimeTypeFromFile = (file: File): string => {
  const fallbackMimeType = "application/octet-stream"

  const fileMimeType = file.type?.trim()
  if (fileMimeType) {
    return fileMimeType
  }

  const lookedUpMimeType = lookupMimeType(file.name)

  if (typeof lookedUpMimeType === "string" && lookedUpMimeType.trim().length) {
    return lookedUpMimeType
  }

  return fallbackMimeType
}
