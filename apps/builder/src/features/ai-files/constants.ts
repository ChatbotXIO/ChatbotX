import { extension as getExtensionFromMime } from "mime-types"

export const AI_FILE_MIME_TYPES = [
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

const EXTENSION_OVERRIDES: Partial<
  Record<(typeof AI_FILE_MIME_TYPES)[number], string | string[]>
> = {
  "text/x-java-properties": "properties",
  "text/markdown": ["md", "markdown"],
  "text/x-markdown": ["md", "mkd"],
}

const aiFileExtensionsSet = new Set<string>()

for (const mimeType of AI_FILE_MIME_TYPES) {
  const mimeExtension = getExtensionFromMime(mimeType)
  const override = EXTENSION_OVERRIDES[mimeType]

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

export const AI_FILE_EXTENSIONS = Array.from(
  aiFileExtensionsSet,
) as readonly string[]

export const AI_FILE_ACCEPT = AI_FILE_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",")
