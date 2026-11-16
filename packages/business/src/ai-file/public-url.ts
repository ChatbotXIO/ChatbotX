import { UploadValidationError } from "@chatbotx.io/filesystem"
import { z } from "zod"

/**
 * Where an AI File URL is downloaded from. Google Docs/Sheets/Slides viewer
 * links are rewritten to their export endpoint (the viewer page is an HTML
 * app shell with none of the document's text); `expectedMimeType` is what a
 * publicly shared file's export returns, so anything else (a sign-in page)
 * can be rejected before the body is read.
 */
export type AIFileUrlSource =
  | { kind: "direct"; url: string }
  | {
      kind: "googleDocs" | "googleSheets" | "googleSlides"
      url: string
      expectedMimeType: string
    }

export const GOOGLE_DOCS_HOST = "docs.google.com"
const GOOGLE_FILE_ID_REGEX = /^[A-Za-z0-9_-]+$/
// /<type>/[u/<n>/]d/<id>/...
const GOOGLE_PATH_REGEX =
  /^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([^/]+)(?:\/([^/]+))?/

const googleExports = {
  document: {
    kind: "googleDocs",
    exportPath: (id: string) => `/document/d/${id}/export?format=txt`,
    expectedMimeType: "text/plain",
  },
  spreadsheets: {
    kind: "googleSheets",
    // XLSX keeps every tab; the CSV export only carries the first one.
    exportPath: (id: string) => `/spreadsheets/d/${id}/export?format=xlsx`,
    expectedMimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  presentation: {
    kind: "googleSlides",
    exportPath: (id: string) => `/presentation/d/${id}/export/pptx`,
    expectedMimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
} as const

const sourceUrlSchema = z.url({ protocol: /^https?$/ })

/**
 * Validates a user-submitted AI File URL and resolves where to download it.
 * Pure (no network, no `node:*`): the SSRF guard runs later, on every hop.
 */
export function normalizeAIFileSourceUrl(rawUrl: string): AIFileUrlSource {
  const parsed = sourceUrlSchema.safeParse(rawUrl.trim())
  if (!parsed.success) {
    throw new UploadValidationError("The provided URL is invalid", "invalidUrl")
  }
  const url = new URL(parsed.data)
  if (url.username || url.password) {
    throw new UploadValidationError(
      "URLs with embedded credentials are not allowed",
      "invalidUrl",
    )
  }

  if (url.hostname.toLowerCase() !== GOOGLE_DOCS_HOST) {
    return { kind: "direct", url: url.href }
  }
  const match = GOOGLE_PATH_REGEX.exec(url.pathname)
  if (!match) {
    return { kind: "direct", url: url.href }
  }
  const [, type, id, next] = match
  const config = googleExports[type as keyof typeof googleExports]
  // Publish-to-web links (/d/e/<pubId>/pub) serve a different page with no
  // stable export endpoint.
  if (id === "e" && next !== undefined) {
    throw new UploadValidationError(
      "Google 'Publish to the web' links are not supported. Share the file publicly and use its normal link.",
      "googlePublishedNotSupported",
    )
  }
  if (!(id && GOOGLE_FILE_ID_REGEX.test(id))) {
    return { kind: "direct", url: url.href }
  }

  const exportUrl = new URL(
    config.exportPath(id),
    `https://${GOOGLE_DOCS_HOST}`,
  )
  // Link-shared files created before Google's 2021 security update need it.
  const resourceKey = url.searchParams.get("resourcekey")
  if (resourceKey) {
    exportUrl.searchParams.set("resourcekey", resourceKey)
  }
  return {
    kind: config.kind,
    url: exportUrl.href,
    expectedMimeType: config.expectedMimeType,
  }
}

const DISPOSITION_EXTENDED_REGEX = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i
const DISPOSITION_QUOTED_REGEX = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i
const DISPOSITION_TOKEN_REGEX = /filename\s*=\s*([^;\s]+)/i
const PATH_SEPARATOR_REGEX = /[\\/]/

/**
 * The filename a `Content-Disposition` header suggests, preferring the RFC
 * 5987 `filename*` form (Google exports send both). Any path is stripped.
 */
export function filenameFromContentDisposition(
  header: string | null,
): string | undefined {
  if (!header) {
    return
  }
  let name: string | undefined
  const extended = DISPOSITION_EXTENDED_REGEX.exec(header)
  if (extended?.[2]) {
    try {
      name = decodeURIComponent(extended[2].trim())
    } catch {
      name = undefined
    }
  }
  if (!name) {
    const quoted = DISPOSITION_QUOTED_REGEX.exec(header)
    name = quoted?.[1]?.replace(/\\(.)/g, "$1")
  }
  if (!name) {
    name = DISPOSITION_TOKEN_REGEX.exec(header)?.[1]
  }
  const base = name?.split(PATH_SEPARATOR_REGEX).pop()?.trim()
  return base || undefined
}
