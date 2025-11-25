import type { Readable } from "node:stream"
import { TextDecoder } from "node:util"
import { uploader } from "@aha.chat/filesystem"
import { htmlToText } from "html-to-text"
import { extractRawText } from "mammoth"
import pdfParse from "pdf-parse-new"
import removeMd from "remove-markdown"
import { read, utils } from "xlsx"
import { logger } from "../../lib/logger"

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
    logger.warn("XLSX parsing failed, falling back to plain text", { error })
    throw new Error("XLSX parsing failed")
  }
}

function extractTextFromCsv(buffer: Buffer): string {
  // Simple fallback: treat as UTF-8 text
  const decoder = new TextDecoder("utf-8")
  return normalizeWhitespace(decoder.decode(buffer))
}

async function extractTextFromHtml(buffer: Buffer): Promise<string> {
  try {
    const decoder = new TextDecoder("utf-8")
    const html = decoder.decode(buffer)
    return await normalizeWhitespace(htmlToText(html, { wordwrap: false }))
  } catch (error) {
    logger.warn("HTML parsing failed, falling back to plain text", { error })
    throw new Error("HTML parsing failed")
  }
}

async function extractTextFromMarkdown(buffer: Buffer): Promise<string> {
  try {
    const decoder = new TextDecoder("utf-8")
    const md = decoder.decode(buffer)
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
    const decoder = new TextDecoder("utf-8")
    return normalizeWhitespace(decoder.decode(buffer))
  }
}

function extractTextFromRtf(buffer: Buffer): string {
  const decoder = new TextDecoder("utf-8")
  const rtf = decoder.decode(buffer)
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

async function extractAsPlainText(
  stream: AsyncIterable<Uint8Array> | Readable,
): Promise<string> {
  const decoder = new TextDecoder("utf-8")
  let out = ""
  for await (const part of stream as AsyncIterable<Uint8Array>) {
    out += decoder.decode(part, { stream: true })
  }
  return normalizeWhitespace(out)
}

export async function extractTextFromFile(
  remotePath: string,
  mimeType: string,
): Promise<string> {
  const lower = (mimeType || "").toLowerCase()

  const fileStream = await uploader.getObjectStream(remotePath)
  const buffer = await streamToBuffer(fileStream)

  if (lower.includes("pdf")) {
    return await extractTextFromPdf(buffer)
  }

  if (
    lower.includes("word") ||
    lower.includes("docx") ||
    lower.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
  ) {
    return extractTextFromDocx(buffer)
  }

  if (
    lower.includes("spreadsheet") ||
    lower.includes("xlsx") ||
    lower.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
  ) {
    return await extractTextFromXlsx(buffer)
  }

  if (lower.includes("csv")) {
    return extractTextFromCsv(buffer)
  }

  if (lower.includes("html") || lower.includes("xhtml")) {
    return await extractTextFromHtml(buffer)
  }
  if (lower.includes("markdown") || lower.includes("md")) {
    return await extractTextFromMarkdown(buffer)
  }
  if (lower.includes("rtf")) {
    return extractTextFromRtf(buffer)
  }

  // default: treat as utf-8 text stream
  return extractAsPlainText(fileStream)
}
