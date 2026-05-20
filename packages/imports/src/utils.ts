import type { ImportFormat } from "@chatbotx.io/database/partials"

const MIME_TO_FORMAT: Record<string, ImportFormat> = {
  "text/csv": "csv",
  "application/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}

const EXTENSION_TO_FORMAT: Record<string, ImportFormat> = {
  csv: "csv",
  xlsx: "xlsx",
  xls: "xls",
}

export const replaceTemplate = (
  template: string,
  params: Record<string, string>,
): string =>
  Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, value),
    template,
  )

export const inferImportFormat = (input: {
  mimeType?: string | null
  fileName?: string | null
}): ImportFormat | null => {
  if (input.mimeType) {
    const fromMime = MIME_TO_FORMAT[input.mimeType.toLowerCase()]
    if (fromMime) {
      return fromMime
    }
  }
  if (input.fileName) {
    const dot = input.fileName.lastIndexOf(".")
    if (dot >= 0) {
      const ext = input.fileName.slice(dot + 1).toLowerCase()
      const fromExt = EXTENSION_TO_FORMAT[ext]
      if (fromExt) {
        return fromExt
      }
    }
  }
  return null
}
