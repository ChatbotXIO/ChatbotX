export const AI_FILE_MIME_TYPES = [
  "application/pdf",
  "text/markdown",
  "text/x-markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "application/json",
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
  "application/epub+zip",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const

export type AIFileMimeType = (typeof AI_FILE_MIME_TYPES)[number]

/** Upload/download cap for every AI File create path (UI, multipart, URL). */
export const AI_FILE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Knowledge MIME type by file extension — the single source for both the
 * upload picker (`allowableKnowledgeExtensionsMap` in `@chatbotx.io/ai`) and
 * the server, which infers a type from a filename when the bytes arrive as
 * `application/octet-stream`. Kept apart from `EXTENSION_MIME_TYPES`, which
 * serves chat-channel media.
 */
export const AI_FILE_EXTENSION_MIME_TYPES: Readonly<
  Record<string, AIFileMimeType>
> = {
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
  md: "text/markdown",
  markdown: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  html: "text/html",
  htm: "text/html",
  xhtml: "application/xhtml+xml",
  xml: "application/xml",
  vtt: "text/vtt",
  properties: "text/x-java-properties",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  rtf: "application/rtf",
  epub: "application/epub+zip",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

/** Lowercased base type without parameters (`"Text/Plain; charset=x"` → `"text/plain"`). */
export function normalizeBaseMimeType(mimeType: string): string {
  return (mimeType.split(";")[0] ?? "").trim().toLowerCase()
}

/** Types that say nothing about the content (S3 stores `binary/octet-stream`). */
const GENERIC_MIME_TYPES: ReadonlySet<string> = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
])

/** Missing or generic binary type: infer the real one from a filename instead. */
export function isGenericMimeType(mimeType: string | undefined): boolean {
  return GENERIC_MIME_TYPES.has(normalizeBaseMimeType(mimeType ?? ""))
}

const AI_FILE_MIME_TYPE_SET: ReadonlySet<string> = new Set(AI_FILE_MIME_TYPES)

export function isKnowledgeMimeType(
  mimeType: string,
): mimeType is AIFileMimeType {
  return AI_FILE_MIME_TYPE_SET.has(normalizeBaseMimeType(mimeType))
}

/** The knowledge MIME type a filename's last extension maps to, if any. */
export function knowledgeMimeTypeFromFilename(
  name: string,
): AIFileMimeType | undefined {
  const dot = name.lastIndexOf(".")
  if (dot === -1 || dot === name.length - 1) {
    return
  }
  const extension = name.slice(dot + 1).toLowerCase()
  return Object.hasOwn(AI_FILE_EXTENSION_MIME_TYPES, extension)
    ? AI_FILE_EXTENSION_MIME_TYPES[extension]
    : undefined
}

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

export const EPUB_MIME_TYPES = ["application/epub+zip"] as const

export const PPT_MIME_TYPES = ["application/vnd.ms-powerpoint"] as const

export const PPTX_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const

/**
 * MIME type by file extension, for media whose type is only known from its URL
 * (a lazily-ingested attachment: nothing was downloaded to sniff). Covers what
 * the chat channels deliver; anything else falls back to a per-kind default.
 */
export const EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  zip: "application/zip",
}
