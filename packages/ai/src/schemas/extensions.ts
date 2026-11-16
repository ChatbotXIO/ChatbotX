import { AI_FILE_EXTENSION_MIME_TYPES } from "@chatbotx.io/sdk"
import z from "zod"

/**
 * Knowledge upload extensions grouped by MIME type, derived from
 * `AI_FILE_EXTENSION_MIME_TYPES` in `@chatbotx.io/sdk` so the picker and the
 * server never disagree on what counts as a knowledge file.
 */
export const allowableKnowledgeExtensionsMap = (): Record<string, string[]> => {
  const map: Record<string, string[]> = {}
  for (const [extension, mimeType] of Object.entries(
    AI_FILE_EXTENSION_MIME_TYPES,
  )) {
    map[mimeType] = [...(map[mimeType] ?? []), `.${extension}`]
  }
  return map
}

export const getAllowableKnowledgeExtensions = () =>
  Object.values(allowableKnowledgeExtensionsMap()).flat().join(",")

export const supportedImageExtensions = z.enum([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
])
export type SupportedImageExtension = z.infer<typeof supportedImageExtensions>

export const supportedAudioExtensions = z.enum([".mp3", ".wav", ".ogg", ".m4a"])
export const supportedVideoExtensions = z.enum([".mp4", ".mov", ".avi", ".wmv"])
export const supportedFileExtensions = z.enum([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
])
