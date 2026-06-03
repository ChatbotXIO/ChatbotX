import z from "zod"

export const allowableKnowledgeExtensionsMap = () => ({
  "text/plain": [".txt"],
  "application/pdf": [".pdf"],
  "text/markdown": [".md", ".markdown"],
  "text/x-markdown": [".md", ".markdown"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/msword": [".doc"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "text/html": [".html", ".htm"],
  "application/xhtml+xml": [".xhtml"],
  "application/xml": [".xml"],
  "text/xml": [".xml"],
  "text/vtt": [".vtt"],
  "text/x-java-properties": [".properties"],
  "message/rfc822": [".eml"],
  "application/vnd.ms-outlook": [".msg"],
  "application/rtf": [".rtf"],
  "text/rtf": [".rtf"],
  "application/epub+zip": [".epub"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
})

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
