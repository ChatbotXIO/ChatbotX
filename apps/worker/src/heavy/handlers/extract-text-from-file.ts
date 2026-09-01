import { uploader } from "@chatbotx.io/filesystem"
import {
  CSV_MIME_TYPES,
  DOCX_MIME_TYPES,
  EMAIL_MIME_TYPES,
  EPUB_MIME_TYPES,
  HTML_MIME_TYPES,
  MARKDOWN_MIME_TYPES,
  PDF_MIME_TYPES,
  PPT_MIME_TYPES,
  PPTX_MIME_TYPES,
  PROPERTIES_MIME_TYPES,
  RTF_MIME_TYPES,
  SPREADSHEET_MIME_TYPES,
  VTT_MIME_TYPES,
  XML_MIME_TYPES,
} from "@chatbotx.io/sdk"
import type { HeavyJobExtractTextFromFile } from "@chatbotx.io/worker-config"
import { UnrecoverableError } from "bullmq"
import { extractTextFromFile } from "../../ai-agent/lib/text-extractor"
import { env } from "../../env"
import { pickRelevantFallbackSnippets } from "../../integration/handlers/automated-response/system-tools/fallback-text-utils"
import { logger } from "../../lib/logger"

const supportedDocumentMimeTypes = new Set<string>([
  ...CSV_MIME_TYPES,
  ...DOCX_MIME_TYPES,
  ...EMAIL_MIME_TYPES,
  ...EPUB_MIME_TYPES,
  ...HTML_MIME_TYPES,
  ...MARKDOWN_MIME_TYPES,
  ...PDF_MIME_TYPES,
  ...PPT_MIME_TYPES,
  ...PPTX_MIME_TYPES,
  ...PROPERTIES_MIME_TYPES,
  ...RTF_MIME_TYPES,
  ...SPREADSHEET_MIME_TYPES,
  ...VTT_MIME_TYPES,
  ...XML_MIME_TYPES,
])

function normalizeMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(";")[0]?.trim() || ""
}

export async function extractFallbackTextSnippets(
  data: HeavyJobExtractTextFromFile["data"],
) {
  const mimeType = normalizeMimeType(data.mimeType)
  if (!supportedDocumentMimeTypes.has(mimeType)) {
    throw new UnrecoverableError("Unsupported document type")
  }

  try {
    const head = await uploader.headObject(data.originPath)
    if (
      head.ContentLength != null &&
      head.ContentLength > env.HEAVY_MAX_FILE_BYTES
    ) {
      throw new UnrecoverableError("Document is too large for document reader")
    }
  } catch (err) {
    if (err instanceof UnrecoverableError) {
      throw err
    }
    logger.warn(
      { err, originPath: data.originPath, workspaceId: data.workspaceId },
      "[document-reader] headObject failed, falling back to byte check",
    )
  }

  const parsedText = await extractTextFromFile(data.originPath, mimeType, {
    maxBytes: env.HEAVY_MAX_FILE_BYTES,
    maxTextChars: env.HEAVY_MAX_EXTRACTED_TEXT_CHARS,
  })
  const truncated = parsedText.length >= env.HEAVY_MAX_EXTRACTED_TEXT_CHARS
  const snippets = pickRelevantFallbackSnippets(parsedText, data.query).map(
    (snippet) => snippet.content,
  )

  return { snippets, truncated }
}
