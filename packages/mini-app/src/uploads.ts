import type { MiniAppDefinition, MiniAppNode } from "./types"

/**
 * Rules for files a visitor uploads through a Mini App's web link
 * (PhotoPicker / DocumentPicker). The type of a file is decided from its
 * first bytes, never from the extension or the browser-sent MIME type.
 */

/** Meta's own cap for a single Flow upload. */
export const MINI_APP_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const MINI_APP_MAX_UPLOADS_PER_INPUT = 30
/** Bytes read from the start of a file to identify its type. */
export const MINI_APP_UPLOAD_SNIFF_BYTES = 4096

/** 16 random bytes, base64url — the visitor's proof they uploaded a file. */
export const MINI_APP_UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

export const MINI_APP_PHOTO_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]

const OOXML_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]
const OLE_MIME_TYPES = [
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]
const TEXT_MIME_TYPES = ["text/plain", "text/csv"]

/** Used when a DocumentPicker sets no `allowed-mime-types`. */
export const MINI_APP_DEFAULT_DOCUMENT_MIME_TYPES: readonly string[] = [
  "application/pdf",
  ...OLE_MIME_TYPES,
  ...OOXML_MIME_TYPES,
  ...TEXT_MIME_TYPES,
  ...MINI_APP_PHOTO_MIME_TYPES,
]

/** Never stored, whatever a DocumentPicker allows: they could run in a browser from a public URL. */
const BLOCKED_MIME_PATTERN =
  /(html|svg|xml|javascript|ecmascript|x-sh|x-php|x-msdownload|x-executable)/i

const startsWith = (
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
) => signature.every((byte, index) => bytes[offset + index] === byte)

const asciiAt = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
])
const MARKUP_PATTERN = /<\s*(!doctype|html|script|svg|iframe|\?xml)/i

/**
 * The real type of a file from its first bytes. Returns the declared type
 * only where the format has no signature (OOXML/OLE families, plain text)
 * and the bytes are consistent with it; otherwise undefined.
 */
export const sniffMimeType = (
  head: Uint8Array,
  declaredMimeType: string,
): string | undefined => {
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return "image/jpeg"
  }
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (asciiAt(head, 0, 4) === "RIFF" && asciiAt(head, 8, 4) === "WEBP") {
    return "image/webp"
  }
  if (asciiAt(head, 4, 4) === "ftyp" && HEIC_BRANDS.has(asciiAt(head, 8, 4))) {
    return "image/heic"
  }
  if (asciiAt(head, 0, 5) === "%PDF-") {
    return "application/pdf"
  }
  const declared = declaredMimeType.toLowerCase()
  // ZIP container: only trusted as the Office document it claims to be.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    return OOXML_MIME_TYPES.includes(declared) ? declared : undefined
  }
  // OLE compound file (legacy .doc/.xls/.ppt).
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return OLE_MIME_TYPES.includes(declared) ? declared : undefined
  }
  if (TEXT_MIME_TYPES.includes(declared)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(head)
    const isBinary = head.includes(0)
    return isBinary || MARKUP_PATTERN.test(text) ? undefined : declared
  }
  return
}

export interface MiniAppUploadRules {
  allowedMimeTypes: readonly string[]
  isPhoto: boolean
  maxBytes: number
  maxFiles: number
}

const isFilePicker = (node: MiniAppNode) =>
  node.type === "PhotoPicker" || node.type === "DocumentPicker"

/** The upload rules of a file input, or undefined when `name` is not one. */
export const resolveUploadRules = (
  definition: MiniAppDefinition,
  inputName: string,
): MiniAppUploadRules | undefined => {
  for (const screen of definition.screens) {
    const location = findNodeByName(screen.children, inputName)
    if (location) {
      return rulesFor(location)
    }
  }
  return
}

const findNodeByName = (
  nodes: readonly MiniAppNode[],
  name: string,
): MiniAppNode | undefined => {
  for (const node of nodes) {
    if (isFilePicker(node) && node.props.name === name) {
      return node
    }
    for (const children of Object.values(node.slots ?? {})) {
      const found = findNodeByName(children, name)
      if (found) {
        return found
      }
    }
  }
  return
}

const readNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const rulesFor = (node: MiniAppNode): MiniAppUploadRules => {
  const isPhoto = node.type === "PhotoPicker"
  const sizeKb = readNumber(
    node.props["max-file-size-kb"],
    MINI_APP_MAX_UPLOAD_BYTES / 1024,
  )
  const maxFiles = readNumber(
    node.props[isPhoto ? "max-uploaded-photos" : "max-uploaded-documents"],
    MINI_APP_MAX_UPLOADS_PER_INPUT,
  )
  return {
    isPhoto,
    maxBytes: Math.min(sizeKb * 1024, MINI_APP_MAX_UPLOAD_BYTES),
    maxFiles: Math.min(maxFiles, MINI_APP_MAX_UPLOADS_PER_INPUT),
    allowedMimeTypes: isPhoto
      ? MINI_APP_PHOTO_MIME_TYPES
      : documentMimeTypes(node),
  }
}

const documentMimeTypes = (node: MiniAppNode): readonly string[] => {
  const configured = node.props["allowed-mime-types"]
  return Array.isArray(configured) && configured.length > 0
    ? (configured as string[]).map((type) => type.toLowerCase())
    : MINI_APP_DEFAULT_DOCUMENT_MIME_TYPES
}

export type MiniAppUploadRejection = "empty" | "too_large" | "type_not_allowed"

/** Checks one file against an input's rules; returns its verified MIME type. */
export const verifyUpload = (input: {
  rules: MiniAppUploadRules
  size: number
  head: Uint8Array
  declaredMimeType: string
}):
  | { ok: true; mimeType: string }
  | { ok: false; reason: MiniAppUploadRejection } => {
  if (input.size <= 0) {
    return { ok: false, reason: "empty" }
  }
  if (input.size > input.rules.maxBytes) {
    return { ok: false, reason: "too_large" }
  }
  const mimeType = sniffMimeType(input.head, input.declaredMimeType)
  const heicAlias =
    mimeType === "image/heic" &&
    input.rules.allowedMimeTypes.includes("image/heif")
  if (
    !mimeType ||
    BLOCKED_MIME_PATTERN.test(mimeType) ||
    !(input.rules.allowedMimeTypes.includes(mimeType) || heicAlias)
  ) {
    return { ok: false, reason: "type_not_allowed" }
  }
  return { ok: true, mimeType }
}

const DIACRITICS = /[̀-ͯ]/g
const LOWER_D_STROKE = /đ/g
const UPPER_D_STROKE = /Đ/g
const UNSAFE_CHARACTERS = /[^a-z0-9._-]+/g
const REPEATED_DASHES = /-{2,}/g
const EDGE_PUNCTUATION = /^[-._]+|[-._]+$/g
const EXTENSION = /\.([a-z0-9]{1,10})$/
const MAX_FILE_NAME_LENGTH = 80

/**
 * A URL-safe file name: "CMND mặt trước.JPG" → "cmnd-mat-truoc.jpg". The
 * extension is kept; an empty result becomes "file".
 */
export const sanitizeFileName = (name: string): string => {
  const ascii = name
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(LOWER_D_STROKE, "d")
    .replace(UPPER_D_STROKE, "D")
    .toLowerCase()
    .trim()
  const extension = EXTENSION.exec(ascii)?.[0] ?? ""
  const base = ascii
    .slice(0, ascii.length - extension.length)
    .replace(UNSAFE_CHARACTERS, "-")
    .replace(REPEATED_DASHES, "-")
    .replace(EDGE_PUNCTUATION, "")
    .slice(0, MAX_FILE_NAME_LENGTH - extension.length)
    .replace(EDGE_PUNCTUATION, "")
  return `${base || "file"}${extension}`
}

/**
 * Storage key of an uploaded file. A known contact's files live in the
 * contact's folder; anonymous ones under the Mini App.
 */
export const buildUploadPath = (input: {
  workspaceId: string
  miniAppId: string
  contactId?: string | null
  randomKey: string
  fileName: string
}): string =>
  input.contactId
    ? `public/space/${input.workspaceId}/contacts/${input.contactId}/mini-apps/${input.randomKey}/${input.fileName}`
    : `public/space/${input.workspaceId}/mini-apps/${input.miniAppId}/anonymous/${input.randomKey}/${input.fileName}`

/** Names of every PhotoPicker / DocumentPicker in the Mini App. */
export const collectFileInputNames = (
  definition: MiniAppDefinition,
): Set<string> => {
  const names = new Set<string>()
  const visit = (nodes: readonly MiniAppNode[]) => {
    for (const node of nodes) {
      if (isFilePicker(node) && typeof node.props.name === "string") {
        names.add(node.props.name)
      }
      for (const children of Object.values(node.slots ?? {})) {
        visit(children)
      }
    }
  }
  for (const screen of definition.screens) {
    visit(screen.children)
  }
  return names
}
