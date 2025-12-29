import { extension as getExtensionFromMime } from "mime-types"

const allAIFileMimeTypes = [
  "application/pdf",
  "text/markdown",
  "text/x-markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/html",
  "application/xhtml+xml",
  "application/xml",
  "text/xml",
  "text/vtt",
  "text/x-java-properties",
  "message/rfc822",
  "application/vnd.ms-outlook",
] as const

const extensionOverrides: Partial<
  Record<(typeof allAIFileMimeTypes)[number], string | string[]>
> = {
  "text/x-java-properties": "properties",
  "text/markdown": ["md", "markdown"],
  "text/x-markdown": ["md", "mkd"],
}

export const getAIFileExtensions = (): string[] => {
  const aiFileExtensionsSet = new Set<string>()

  for (const mimeType of allAIFileMimeTypes) {
    const mimeExtension = getExtensionFromMime(mimeType)
    const override = extensionOverrides[mimeType]

    const primary =
      mimeExtension || (typeof override === "string" ? override : null)
    if (primary) {
      aiFileExtensionsSet.add(primary)
    }

    if (Array.isArray(override)) {
      for (const ext of override) {
        aiFileExtensionsSet.add(ext)
      }
    }
  }

  return Array.from(aiFileExtensionsSet)
}

export const getAIFileExtensionsAccept = () => {
  return getAIFileExtensions()
    .map((extension) => `.${extension}`)
    .join(",")
}
