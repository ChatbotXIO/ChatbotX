import type { Readable } from "node:stream"
import { TextDecoder } from "node:util"
import { uploader } from "@aha.chat/filesystem"
import { htmlToText } from "html-to-text"
import { simpleParser } from "mailparser"
import { extractRawText } from "mammoth"
import pdfParse from "pdf-parse-new"
import removeMd from "remove-markdown"
import { read, utils } from "xlsx"
import { logger } from "../../lib/logger"

const PRINTABLE_CHAR_REGEX = /[\x20-\x7E\n\r\t]/
const UTF8_DECODER = new TextDecoder("utf-8")
const UTF8_NON_FATAL_DECODER = new TextDecoder("utf-8", { fatal: false })

const PDF_MIME_KEYWORDS = ["pdf"]

const DOCX_MIME_KEYWORDS = [
  "word",
  "docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

const SPREADSHEET_MIME_KEYWORDS = [
  "spreadsheet",
  "xlsx",
  "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]

const CSV_MIME_KEYWORDS = ["csv"]

const HTML_MIME_KEYWORDS = ["html", "xhtml", "htm"]

const MARKDOWN_MIME_KEYWORDS = ["markdown", "md", "mdx"]
const MARKDOWN_EXTENSIONS = ["md", "mdx", "markdown"]

const RTF_MIME_KEYWORDS = ["rtf"]

const XML_MIME_KEYWORDS = ["xml"]
const XML_EXTENSIONS = ["xml"]

const EMAIL_MIME_KEYWORDS = [
  "eml",
  "message/rfc822",
  "application/vnd.ms-outlook",
  "msg",
]
const EMAIL_EXTENSIONS = ["eml", "msg"]

const VTT_MIME_KEYWORDS = ["vtt"]
const VTT_EXTENSIONS = ["vtt"]

const PROPERTIES_MIME_KEYWORDS = ["properties"]
const PROPERTIES_EXTENSIONS = ["properties"]

const decodeUtf8 = (buffer: Buffer): string => UTF8_DECODER.decode(buffer)

const decodeUtf8NonFatal = (buffer: Buffer): string =>
  UTF8_NON_FATAL_DECODER.decode(buffer)

const mimeIncludesAny = (mime: string, keywords: string[]): boolean =>
  keywords.some((keyword) => mime.includes(keyword))

const extensionMatchesAny = (extension: string, allowed: string[]): boolean =>
  allowed.includes(extension)

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
): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const part of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(part))
  }
  return Buffer.concat(chunks)
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const parser = await pdfParse(buffer)

    return parser.text
  } catch (error) {
    logger.warn("PDF parsing failed, falling back to plain text", { error })
    throw new Error("PDF parsing failed")
  }
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const { value } = await extractRawText({ buffer })
    return normalizeWhitespace(value || "")
  } catch (error) {
    logger.warn("DOCX parsing failed, falling back to plain text", { error })
    throw new Error("DOCX parsing failed")
  }
}

async function extractTextFromXlsx(buffer: Buffer): Promise<string> {
  try {
    const workbook = read(buffer, { type: "buffer" })
    const texts: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) {
        continue
      }
      const csv = utils.sheet_to_csv(sheet)
      if (csv) {
        texts.push(csv)
      }
    }
    return await normalizeWhitespace(texts.join("\n"))
  } catch (error) {
    logger.warn("XLSX/XLS parsing failed, falling back to plain text", {
      error,
    })
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
    logger.warn("HTML parsing failed, falling back to plain text", { error })
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
    logger.warn("Markdown parsing failed, falling back to plain text", {
      error,
    })
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
  } catch (_error) {
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
  } catch (_error) {
    return normalizeWhitespace(decodeUtf8(buffer))
  }
}

export async function extractTextFromFile(
  remotePath: string,
  mimeType: string,
  filename?: string,
): Promise<string> {
  const lowerMimeType = (mimeType || "").toLowerCase()

  // Extract extension from filename if mimeType is unclear
  const extension = filename
    ? filename.split(".").pop()?.toLowerCase() || ""
    : ""

  const fileStream = await uploader.getObjectStream(remotePath)
  const buffer = await streamToBuffer(fileStream)

  if (mimeIncludesAny(lowerMimeType, PDF_MIME_KEYWORDS)) {
    return await extractTextFromPdf(buffer)
  }

  if (mimeIncludesAny(lowerMimeType, DOCX_MIME_KEYWORDS)) {
    return extractTextFromDocx(buffer)
  }

  if (mimeIncludesAny(lowerMimeType, SPREADSHEET_MIME_KEYWORDS)) {
    return await extractTextFromXlsx(buffer)
  }

  if (mimeIncludesAny(lowerMimeType, CSV_MIME_KEYWORDS)) {
    return extractTextFromCsv(buffer)
  }

  if (mimeIncludesAny(lowerMimeType, HTML_MIME_KEYWORDS)) {
    return await extractTextFromHtml(buffer)
  }

  if (
    mimeIncludesAny(lowerMimeType, MARKDOWN_MIME_KEYWORDS) ||
    extensionMatchesAny(extension, MARKDOWN_EXTENSIONS)
  ) {
    return await extractTextFromMarkdown(buffer)
  }

  if (mimeIncludesAny(lowerMimeType, RTF_MIME_KEYWORDS)) {
    return extractTextFromRtf(buffer)
  }

  if (
    mimeIncludesAny(lowerMimeType, XML_MIME_KEYWORDS) ||
    extensionMatchesAny(extension, XML_EXTENSIONS)
  ) {
    return extractTextFromXml(buffer)
  }

  if (
    mimeIncludesAny(lowerMimeType, EMAIL_MIME_KEYWORDS) ||
    extensionMatchesAny(extension, EMAIL_EXTENSIONS)
  ) {
    return await extractTextFromEmail(buffer)
  }

  if (
    mimeIncludesAny(lowerMimeType, VTT_MIME_KEYWORDS) ||
    extensionMatchesAny(extension, VTT_EXTENSIONS)
  ) {
    return normalizeWhitespace(decodeUtf8(buffer))
  }

  if (
    mimeIncludesAny(lowerMimeType, PROPERTIES_MIME_KEYWORDS) ||
    extensionMatchesAny(extension, PROPERTIES_EXTENSIONS)
  ) {
    return normalizeWhitespace(decodeUtf8(buffer))
  }

  // default: treat as utf-8 text stream
  return normalizeWhitespace(decodeUtf8(buffer))
}
