import { isUtf8 } from "node:buffer"
import type { Readable } from "node:stream"
import { TextDecoder } from "node:util"
import { uploader } from "@chatbotx.io/filesystem"
import { createByteLimitedStream } from "@chatbotx.io/imports/stream-guard"
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
import { htmlToText } from "html-to-text"
import JSZip from "jszip"
import { simpleParser } from "mailparser"
import { extractRawText } from "mammoth"
import { lookup } from "mime-types"
import pdfParse from "pdf-parse-new"
import removeMd from "remove-markdown"
import { read, utils, type WorkSheet } from "xlsx"
import { logger } from "../../lib/logger"
import type { KnowledgeDocument, TabularSheet } from "./chunkers/types"
import { FileFetchError, FileSizeLimitError } from "./extraction-errors"

const MAX_EXTRACTABLE_PAGES = 200
const MAX_EXTRACTED_TEXT_CHARS = 5_000_000
const PRINTABLE_CHAR_REGEX = /[\x20-\x7E\n\r\t]/
const PPTX_SLIDE_FILE_REGEX = /^ppt\/slides\/slide\d+\.xml$/
const PPTX_NOTES_FILE_REGEX = /^ppt\/notesSlides\/notesSlide\d+\.xml$/
const PPTX_SLIDE_NUM_REGEX = /slide(\d+)\.xml$/
const PPTX_TEXT_TAG_REGEX = /<a:t[^>]*>([^<]*)<\/a:t>/g
const PPTX_TAG_STRIP_REGEX = /<[^>]+>/g
const EPUB_OPF_PATH_REGEX = /full-path="([^"]+\.opf)"/
const EPUB_ITEMREF_REGEX = /<itemref\s[^>]*idref="([^"]+)"/g
const EPUB_IDREF_REGEX = /idref="([^"]+)"/
const EPUB_CONTENT_FILE_REGEX = /\.(html|xhtml|htm)$/i
const UTF8_DECODER = new TextDecoder("utf-8")
const UTF8_NON_FATAL_DECODER = new TextDecoder("utf-8", { fatal: false })
const UTF16LE_DECODER = new TextDecoder("utf-16le")

const decodeUtf8 = (buffer: Buffer): string => UTF8_DECODER.decode(buffer)

const decodeUtf8NonFatal = (buffer: Buffer): string =>
  UTF8_NON_FATAL_DECODER.decode(buffer)

const normalizeMimeType = (mimeType: string): string =>
  mimeType.toLowerCase().split(";")[0]?.trim() || ""

type ExtractionOptions = {
  maxBytes?: number
  maxTextChars?: number
}

const isMimeType = (
  mimeType: string,
  allowedTypes: readonly string[],
): boolean => {
  const normalized = normalizeMimeType(mimeType)
  return allowedTypes.includes(normalized)
}

function normalizeWhitespace(input: string): string {
  let out = ""
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    // keep newlines, replace other control chars (<32) with space
    if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
      out += " "
    } else {
      out += input[i]
    }
  }
  // normalize windows newlines, collapse tabs/spaces
  out = out.replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ")
  // collapse multiple blank lines
  out = out.replace(/\n{3,}/g, "\n\n")
  return out.trim()
}

async function streamToBuffer(
  stream: AsyncIterable<Uint8Array> | Readable,
  options?: { maxBytes?: number },
): Promise<Buffer> {
  const sizeLimitMessage =
    options?.maxBytes == null
      ? undefined
      : `File exceeds ${options.maxBytes} byte limit`
  const readable =
    options?.maxBytes == null || sizeLimitMessage === undefined
      ? stream
      : createByteLimitedStream(stream as Readable, {
          maxBytes: options.maxBytes,
          errorMessage: sizeLimitMessage,
        })
  const chunks: Buffer[] = []
  try {
    for await (const part of readable as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(part))
    }
  } catch (error) {
    if (error instanceof Error && error.message === sizeLimitMessage) {
      throw new FileSizeLimitError(sizeLimitMessage, { cause: error })
    }
    throw error
  }
  return Buffer.concat(chunks)
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse defaults to info verbosity, which floods logs with font-hinting
    // notices ("TT: CALL empty stack") that do not affect text extraction.
    const parser = await pdfParse(buffer, { verbosityLevel: 0 })
    // pdf-parse can return NUL and other control characters. PostgreSQL text
    // values reject NUL bytes, so normalize before the text is chunked and
    // persisted as AIEmbedding content.
    return normalizeWhitespace(parser.text)
  } catch (error) {
    logger.warn(error, "PDF parsing failed, falling back to plain text")
    throw new Error("PDF parsing failed")
  }
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const { value } = await extractRawText({ buffer })
    return normalizeWhitespace(value || "")
  } catch (error) {
    logger.warn(error, "DOCX parsing failed, falling back to plain text")
    throw new Error("DOCX parsing failed")
  }
}

function extractTextFromXlsx(buffer: Buffer): string {
  try {
    const workbook = read(buffer, { type: "buffer" })
    const rowBlocks: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) {
        continue
      }

      // sheet_to_json preserves full cell values (no truncation unlike sheet_to_csv)
      const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      })

      if (rows.length === 0) {
        continue
      }

      // Emit each row as "Header: value\nHeader: value\n..." block
      // so URLs stay intact within a single paragraph separator (\n\n)
      for (const row of rows) {
        const parts = Object.entries(row)
          .filter(([, v]) => v !== "" && v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${v}`)
        if (parts.length > 0) {
          rowBlocks.push(parts.join("\n"))
        }
      }
    }

    return rowBlocks.join("\n\n").slice(0, MAX_EXTRACTED_TEXT_CHARS)
  } catch (error) {
    logger.warn(error, "XLSX/XLS parsing failed, falling back to plain text")
    throw new Error("XLSX/XLS parsing failed")
  }
}

function extractTextFromCsv(buffer: Buffer): string {
  // Simple fallback: treat as UTF-8 text
  return normalizeWhitespace(decodeUtf8(buffer))
}

async function extractTextFromHtml(buffer: Buffer): Promise<string> {
  try {
    const html = decodeUtf8(buffer)
    return await normalizeWhitespace(htmlToText(html, { wordwrap: false }))
  } catch (error) {
    logger.warn(error, "HTML parsing failed, falling back to plain text")
    throw new Error("HTML parsing failed")
  }
}

async function extractTextFromMarkdown(buffer: Buffer): Promise<string> {
  try {
    const md = decodeUtf8(buffer)
    const plain = removeMd(md, {
      stripListLeaders: true,
      gfm: true,
      useImgAltText: true,
    })
    return await normalizeWhitespace(plain)
  } catch (error) {
    logger.warn(error, "Markdown parsing failed, falling back to plain text")
    return normalizeWhitespace(decodeUtf8(buffer))
  }
}

function extractTextFromRtf(buffer: Buffer): string {
  const rtf = decodeUtf8(buffer)
  // Very basic RTF to text: remove groups, control words, keep plain text
  // 1) Remove escaped hex like \'hh
  let text = rtf.replace(/\\'[0-9a-fA-F]{2}/g, " ")
  // 2) Remove RTF control words (e.g., \b, \par, \fs24)
  text = text.replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
  // 3) Remove RTF groups { ... }
  text = text.replace(/\{[^{}]*\}/g, " ")
  // 4) Remove remaining braces and backslashes
  text = text.replace(/[{}\\]/g, " ")

  return normalizeWhitespace(text)
}

async function extractTextFromEmail(buffer: Buffer): Promise<string> {
  try {
    const parsed = await simpleParser(buffer)
    const parts: string[] = []

    if (parsed.subject) {
      parts.push(`Subject: ${parsed.subject}`)
    }
    if (parsed.from) {
      const fromText = Array.isArray(parsed.from)
        ? parsed.from.map((f) => f.text).join(", ")
        : parsed.from.text
      if (fromText) {
        parts.push(`From: ${fromText}`)
      }
    }
    if (parsed.to) {
      const toText = Array.isArray(parsed.to)
        ? parsed.to.map((t) => t.text).join(", ")
        : parsed.to.text
      if (toText) {
        parts.push(`To: ${toText}`)
      }
    }
    if (parsed.text) {
      parts.push(parsed.text)
    }
    if (parsed.html) {
      const htmlText = await htmlToText(parsed.html, { wordwrap: false })
      parts.push(htmlText)
    }

    const result = normalizeWhitespace(parts.join("\n\n"))
    if (!result || result.trim().length === 0) {
      return normalizeWhitespace(decodeUtf8NonFatal(buffer))
    }
    return result
  } catch {
    const decoded = decodeUtf8NonFatal(buffer)
    const printableRatio =
      decoded
        .split("")
        .filter((character) => PRINTABLE_CHAR_REGEX.test(character)).length /
      decoded.length
    if (printableRatio < 0.5) {
      return normalizeWhitespace(
        `[Outlook MSG file - content extraction may be limited]\n\n${decoded.slice(0, 1000)}`,
      )
    }
    return normalizeWhitespace(decoded)
  }
}

async function extractTextFromPptx(buffer: Buffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer)

    const extractTextsFromXml = async (fileNames: string[]) => {
      const texts: string[] = []
      for (const fileName of fileNames) {
        const xml = await zip.files[fileName]?.async("string")
        if (!xml) {
          continue
        }
        const text = xml
          .match(PPTX_TEXT_TAG_REGEX)
          ?.map((t: string) => t.replace(PPTX_TAG_STRIP_REGEX, ""))
          .join(" ")
        if (text?.trim()) {
          texts.push(text)
        }
      }
      return texts
    }

    const slideNames = Object.keys(zip.files)
      .filter((name) => PPTX_SLIDE_FILE_REGEX.test(name))
      .sort((a, b) => {
        const numA = Number.parseInt(
          a.match(PPTX_SLIDE_NUM_REGEX)?.[1] ?? "0",
          10,
        )
        const numB = Number.parseInt(
          b.match(PPTX_SLIDE_NUM_REGEX)?.[1] ?? "0",
          10,
        )
        return numA - numB
      })

    const noteNames = Object.keys(zip.files)
      .filter((name) => PPTX_NOTES_FILE_REGEX.test(name))
      .sort((a, b) => {
        const numA = Number.parseInt(
          a.match(PPTX_SLIDE_NUM_REGEX)?.[1] ?? "0",
          10,
        )
        const numB = Number.parseInt(
          b.match(PPTX_SLIDE_NUM_REGEX)?.[1] ?? "0",
          10,
        )
        return numA - numB
      })

    if (slideNames.length > MAX_EXTRACTABLE_PAGES) {
      logger.warn(
        { total: slideNames.length, limit: MAX_EXTRACTABLE_PAGES },
        "PPTX slide count exceeds limit, truncating",
      )
    }

    const slideTexts = await extractTextsFromXml(
      slideNames.slice(0, MAX_EXTRACTABLE_PAGES),
    )
    const noteTexts = await extractTextsFromXml(
      noteNames.slice(0, MAX_EXTRACTABLE_PAGES),
    )

    const result = normalizeWhitespace(
      [...slideTexts, ...noteTexts].join("\n\n"),
    )
    return result.slice(0, MAX_EXTRACTED_TEXT_CHARS)
  } catch (error) {
    logger.warn(error, "PPTX parsing failed")
    throw new Error("PPTX parsing failed")
  }
}

function extractTextFromPpt(buffer: Buffer): string {
  // PPT is a Compound Binary Format (OLE) — extract UTF-16LE text runs heuristically
  const MIN_RUN_CHARS = 4
  const texts: string[] = []
  let i = 0
  while (i < buffer.length - 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: reading UTF-16LE code units from binary
    const codeUnit = (buffer[i] as number) | ((buffer[i + 1] as number) << 8)
    const isPrintableBmp =
      (codeUnit >= 0x20 && codeUnit < 0xd8_00) ||
      (codeUnit > 0xdf_ff && codeUnit < 0xff_fe)
    if (isPrintableBmp) {
      const start = i
      while (i < buffer.length - 1) {
        // biome-ignore lint/suspicious/noBitwiseOperators: reading UTF-16LE code units from binary
        const cu = (buffer[i] as number) | ((buffer[i + 1] as number) << 8)
        if (cu < 0x20 || (cu >= 0xd8_00 && cu <= 0xdf_ff) || cu >= 0xff_fe) {
          break
        }
        i += 2
      }
      if ((i - start) / 2 >= MIN_RUN_CHARS) {
        texts.push(UTF16LE_DECODER.decode(buffer.subarray(start, i)))
      }
    } else {
      i++
    }
  }
  return normalizeWhitespace(texts.join(" "))
}

async function extractTextFromEpub(buffer: Buffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer)

    const containerXml =
      await zip.files["META-INF/container.xml"]?.async("string")
    const opfPath = containerXml?.match(EPUB_OPF_PATH_REGEX)?.[1]

    let contentPaths: string[] = []

    if (opfPath && zip.files[opfPath]) {
      const opfContent = await zip.files[opfPath].async("string")
      const opfDir = opfPath.split("/").slice(0, -1).join("/")

      const idrefs = (opfContent.match(EPUB_ITEMREF_REGEX) ?? []).map(
        (m: string) => m.match(EPUB_IDREF_REGEX)?.[1],
      )

      for (const idref of idrefs) {
        if (!idref) {
          continue
        }
        const hrefMatch =
          opfContent.match(
            new RegExp(`<item[^>]+id="${idref}"[^>]+href="([^"]+)"`),
          ) ??
          opfContent.match(
            new RegExp(`<item[^>]+href="([^"]+)"[^>]+id="${idref}"`),
          )
        const href = hrefMatch?.[1]
        if (href) {
          contentPaths.push(opfDir ? `${opfDir}/${href}` : href)
        }
      }
    }

    if (!contentPaths.length) {
      contentPaths = Object.keys(zip.files).filter((name) =>
        EPUB_CONTENT_FILE_REGEX.test(name),
      )
    }

    if (contentPaths.length > MAX_EXTRACTABLE_PAGES) {
      logger.warn(
        { total: contentPaths.length, limit: MAX_EXTRACTABLE_PAGES },
        "EPUB chapter count exceeds limit, truncating",
      )
      contentPaths = contentPaths.slice(0, MAX_EXTRACTABLE_PAGES)
    }

    const texts: string[] = []
    for (const filePath of contentPaths) {
      const html = await zip.files[filePath]?.async("string")
      if (html) {
        const text = htmlToText(html, { wordwrap: false })
        if (text.trim()) {
          texts.push(text)
        }
      }
    }

    const result = normalizeWhitespace(texts.join("\n\n"))
    return result.slice(0, MAX_EXTRACTED_TEXT_CHARS)
  } catch (error) {
    logger.warn(error, "EPUB parsing failed")
    throw new Error("EPUB parsing failed")
  }
}

function extractTextFromXml(buffer: Buffer): string {
  try {
    const xml = decodeUtf8(buffer)
    const text = xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")

    return normalizeWhitespace(text)
  } catch {
    return normalizeWhitespace(decodeUtf8(buffer))
  }
}

async function loadFileForExtraction(
  remotePath: string,
  mimeType: string,
  options?: ExtractionOptions,
): Promise<{ buffer: Buffer; mimeType: string; maxTextChars: number }> {
  const normalizedMimeType = normalizeMimeType(mimeType || "")
  let finalMimeType = normalizedMimeType
  if (!finalMimeType) {
    const extension = remotePath.split(".").pop()?.toLowerCase()
    if (extension) {
      const lookedUpMime = lookup(extension)
      if (lookedUpMime) {
        finalMimeType = normalizeMimeType(lookedUpMime)
      }
    }
  }

  let buffer: Buffer
  try {
    const { stream: fileStream } = await uploader.getObjectStream(remotePath)
    buffer = await streamToBuffer(fileStream, { maxBytes: options?.maxBytes })
  } catch (error) {
    if (error instanceof FileSizeLimitError) {
      throw error
    }
    throw new FileFetchError("Failed to read the file from storage", {
      cause: error,
    })
  }
  return {
    buffer,
    mimeType: finalMimeType,
    maxTextChars: options?.maxTextChars ?? MAX_EXTRACTED_TEXT_CHARS,
  }
}

async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  maxTextChars: number,
): Promise<string> {
  if (isMimeType(mimeType, PDF_MIME_TYPES)) {
    return (await extractTextFromPdf(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, DOCX_MIME_TYPES)) {
    return (await extractTextFromDocx(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, SPREADSHEET_MIME_TYPES)) {
    return extractTextFromXlsx(buffer).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, CSV_MIME_TYPES)) {
    return extractTextFromCsv(buffer).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, HTML_MIME_TYPES)) {
    return (await extractTextFromHtml(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, MARKDOWN_MIME_TYPES)) {
    return (await extractTextFromMarkdown(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, RTF_MIME_TYPES)) {
    return extractTextFromRtf(buffer).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, XML_MIME_TYPES)) {
    return extractTextFromXml(buffer).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, EMAIL_MIME_TYPES)) {
    return (await extractTextFromEmail(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, VTT_MIME_TYPES)) {
    return normalizeWhitespace(decodeUtf8(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, PROPERTIES_MIME_TYPES)) {
    return normalizeWhitespace(decodeUtf8(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, PPTX_MIME_TYPES)) {
    return (await extractTextFromPptx(buffer)).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, PPT_MIME_TYPES)) {
    return extractTextFromPpt(buffer).slice(0, maxTextChars)
  }

  if (isMimeType(mimeType, EPUB_MIME_TYPES)) {
    return (await extractTextFromEpub(buffer)).slice(0, maxTextChars)
  }

  return normalizeWhitespace(decodeUtf8(buffer)).slice(0, maxTextChars)
}

// SheetJS prints a General-format integer of 12+ digits in scientific notation
// ("1.23457E+11"), which drops digits of ids and tax codes stored as numbers.
const LARGE_INTEGER_MIN = 1e11

/**
 * Gives such cells the plain "0" format so `raw: false` prints every digit.
 * Cells with an explicit format (dates, percentages, "#,##0", ...) keep their
 * displayed text; that needs the workbook to be read with `cellNF: true`.
 */
function expandLargeIntegerCells(sheet: WorkSheet): void {
  for (const address in sheet) {
    if (address.startsWith("!")) {
      continue
    }
    const cell = sheet[address]
    if (
      cell?.t === "n" &&
      typeof cell.v === "number" &&
      Number.isInteger(cell.v) &&
      Math.abs(cell.v) >= LARGE_INTEGER_MIN &&
      (cell.z === undefined || cell.z === "General")
    ) {
      cell.z = "0"
      cell.w = undefined
    }
  }
}

function tabularSheetsFromWorkbook(input: {
  sourceName: string
  workbook: ReturnType<typeof read>
  maxTextChars: number
  /** 1-based row holding the column names; rows above it are dropped. */
  headerRowNumber?: number
}): { sheets: TabularSheet[]; truncated: boolean } {
  const sheets: TabularSheet[] = []
  let remaining = input.maxTextChars
  let truncated = false
  let exhausted = false

  const consume = (value: string): string => {
    if (!value) {
      return ""
    }
    if (remaining <= 0) {
      truncated = true
      exhausted = true
      return ""
    }
    const result = value.slice(0, remaining)
    remaining -= result.length
    if (result.length < value.length) {
      truncated = true
      exhausted = true
    }
    return result
  }

  for (const workbookSheetName of input.workbook.SheetNames) {
    if (exhausted) {
      break
    }
    const sheet = input.workbook.Sheets[workbookSheetName]
    if (!sheet) {
      continue
    }
    expandLargeIntegerCells(sheet)
    const matrix = utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    })
    const [headerRow = [], ...dataRows] =
      input.headerRowNumber && input.headerRowNumber > 1
        ? matrix.slice(input.headerRowNumber - 1)
        : matrix
    if (dataRows.length === 0) {
      continue
    }
    // A loop, not Math.max(...rows): spreading ~125k+ rows overflows the stack.
    let columnCount = headerRow.length
    for (const row of dataRows) {
      columnCount = Math.max(columnCount, row.length)
    }
    const headers: string[] = []
    for (let index = 0; index < columnCount; index++) {
      const normalizedHeader = normalizeWhitespace(
        String(headerRow[index] ?? ""),
      )
      const source = normalizedHeader || `Column ${index + 1}`
      headers.push(consume(source))
      if (exhausted) {
        break
      }
    }
    if (exhausted) {
      break
    }

    const rows: string[][] = []
    for (const sourceRow of dataRows) {
      const row: string[] = []
      for (let index = 0; index < columnCount; index++) {
        const source = normalizeWhitespace(String(sourceRow[index] ?? ""))
        row.push(consume(source))
        if (exhausted) {
          break
        }
      }
      if (row.some(Boolean)) {
        rows.push(row)
      }
      if (exhausted) {
        break
      }
    }
    if (rows.length > 0) {
      sheets.push({
        name: workbookSheetName || input.sourceName,
        headers,
        rows,
      })
    }
  }

  return { sheets, truncated }
}

export async function extractKnowledgeDocument(
  remotePath: string,
  mimeType: string,
  options: ExtractionOptions & {
    sourceName: string
    /** Skip table/heading extraction and read the file as plain text. */
    forceProse?: boolean
    /** 1-based spreadsheet row that holds the column names. */
    tabularHeaderRow?: number
  },
): Promise<KnowledgeDocument> {
  const loaded = await loadFileForExtraction(remotePath, mimeType, options)

  // A legacy-encoded CSV (e.g. Excel's Windows-1252 "CSV") would decode with
  // U+FFFD in place of every accented letter and be embedded that way without
  // any error. Reject it so the user re-saves it as CSV UTF-8. Only this
  // knowledge path is strict: `extractTextFromFile` keeps its lenient decode.
  if (isMimeType(loaded.mimeType, CSV_MIME_TYPES) && !isUtf8(loaded.buffer)) {
    throw new Error("CSV file is not valid UTF-8")
  }

  if (
    !options.forceProse &&
    (isMimeType(loaded.mimeType, SPREADSHEET_MIME_TYPES) ||
      isMimeType(loaded.mimeType, CSV_MIME_TYPES))
  ) {
    // CSV cells are already text: `raw: true` stops SheetJS from re-parsing
    // them as dates/numbers, which `raw: false` would then reformat
    // (e.g. "2024-01-15" -> "1/15/24").
    const workbook = isMimeType(loaded.mimeType, CSV_MIME_TYPES)
      ? read(decodeUtf8(loaded.buffer), { type: "string", raw: true })
      : read(loaded.buffer, { type: "buffer", cellNF: true })
    try {
      const structured = tabularSheetsFromWorkbook({
        sourceName: options.sourceName,
        workbook,
        maxTextChars: loaded.maxTextChars,
        headerRowNumber: options.tabularHeaderRow,
      })
      return {
        kind: "tabular",
        sheets: isMimeType(loaded.mimeType, CSV_MIME_TYPES)
          ? structured.sheets.map((sheet) => ({
              ...sheet,
              name: options.sourceName,
            }))
          : structured.sheets,
        truncated: structured.truncated,
      }
    } catch (error) {
      return {
        kind: "prose",
        text: await extractTextFromBuffer(
          loaded.buffer,
          loaded.mimeType,
          loaded.maxTextChars,
        ),
        fallback: { reason: "tabularParseFailed", error },
      }
    }
  }

  if (!options.forceProse && isMimeType(loaded.mimeType, MARKDOWN_MIME_TYPES)) {
    return {
      kind: "markdown",
      text: normalizeWhitespace(decodeUtf8(loaded.buffer)).slice(
        0,
        loaded.maxTextChars,
      ),
    }
  }

  return {
    kind: "prose",
    text: await extractTextFromBuffer(
      loaded.buffer,
      loaded.mimeType,
      loaded.maxTextChars,
    ),
  }
}

export async function extractTextFromFile(
  remotePath: string,
  mimeType: string,
  options?: ExtractionOptions,
): Promise<string> {
  const loaded = await loadFileForExtraction(remotePath, mimeType, options)
  return await extractTextFromBuffer(
    loaded.buffer,
    loaded.mimeType,
    loaded.maxTextChars,
  )
}
