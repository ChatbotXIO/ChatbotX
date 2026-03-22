import { AI_FILE_MIME_TYPES } from "@aha.chat/sdk"
import { extension as getExtensionFromMime } from "mime-types"

const allAIFileMimeTypes = AI_FILE_MIME_TYPES

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
