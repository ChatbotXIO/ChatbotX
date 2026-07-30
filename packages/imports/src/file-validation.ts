import {
  type ImportFormat,
  importFormats,
} from "@chatbotx.io/database/partials"
import type { ImportConfig } from "./types"

const getFileExtension = (fileName: string): string => {
  const extensionStart = fileName.lastIndexOf(".")
  return extensionStart > 0 ? fileName.slice(extensionStart).toLowerCase() : ""
}

export const resolveImportFileFormat = (
  config: ImportConfig,
  file: { fileName: string; mimeType: string },
): ImportFormat | undefined => {
  if (!config.acceptedMimeTypes.includes(file.mimeType)) {
    return
  }
  const extension = getFileExtension(file.fileName)
  if (!config.acceptedExtensions[file.mimeType]?.includes(extension)) {
    return
  }
  const format = importFormats.safeParse(extension.slice(1))
  if (!(format.success && config.acceptedFormats.includes(format.data))) {
    return
  }
  return format.data
}
