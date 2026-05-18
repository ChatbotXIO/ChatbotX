import { DOCX_MIME_TYPES, PDF_MIME_TYPES } from "@chatbotx.io/sdk"

export const SUPPORTED_DOCUMENT_MIME_TYPES = new Set<string>([
  ...PDF_MIME_TYPES,
  ...DOCX_MIME_TYPES,
])

export function normalizeMimeType(value: string): string {
  return value.toLowerCase().split(";")[0]?.trim() ?? ""
}

export function isSupportedDocumentMimeType(mimeType: string): boolean {
  return SUPPORTED_DOCUMENT_MIME_TYPES.has(normalizeMimeType(mimeType))
}
