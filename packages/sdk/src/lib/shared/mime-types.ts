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
  "application/rtf",
  "text/rtf",
] as const

export type AIFileMimeType = (typeof AI_FILE_MIME_TYPES)[number]

export const PDF_MIME_TYPES = ["application/pdf"] as const

export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number]

export const DOCX_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
] as const

export const SPREADSHEET_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const

export const CSV_MIME_TYPES = ["text/csv"] as const

export const HTML_MIME_TYPES = ["text/html", "application/xhtml+xml"] as const

export const MARKDOWN_MIME_TYPES = ["text/markdown", "text/x-markdown"] as const

export const RTF_MIME_TYPES = ["application/rtf", "text/rtf"] as const

export const XML_MIME_TYPES = ["application/xml", "text/xml"] as const

export const EMAIL_MIME_TYPES = [
  "message/rfc822",
  "application/vnd.ms-outlook",
] as const

export const VTT_MIME_TYPES = ["text/vtt"] as const

export const PROPERTIES_MIME_TYPES = ["text/x-java-properties"] as const
