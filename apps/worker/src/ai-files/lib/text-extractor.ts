import type { Readable } from "node:stream"
import { TextDecoder } from "node:util"
import { htmlToText } from "html-to-text"
import mammoth from "mammoth"
import pdfParse from "pdf-parse"
import removeMarkdown from "remove-markdown"
import { read, utils } from "xlsx"

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

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)
  return normalizeWhitespace(result.text || "")
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer })
  return normalizeWhitespace(value || "")
}

function extractFromXlsx(buffer: Buffer): string {
  const workbook = read(buffer, { type: "buffer" }) as {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
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
  return normalizeWhitespace(texts.join("\n"))
}

function extractFromCsv(buffer: Buffer): string {
  // Simple fallback: treat as UTF-8 text
  const decoder = new TextDecoder("utf-8")
  return normalizeWhitespace(decoder.decode(buffer))
}

function extractFromHtml(buffer: Buffer): string {
  const decoder = new TextDecoder("utf-8")
  const html = decoder.decode(buffer)
  return normalizeWhitespace(htmlToText(html, { wordwrap: false }))
}

function extractFromMarkdown(buffer: Buffer): string {
  const decoder = new TextDecoder("utf-8")
  const md = decoder.decode(buffer)
  const plain = removeMarkdown(md, { stripListLeaders: true, gfm: true })
  return normalizeWhitespace(plain)
}

function extractFromRtf(buffer: Buffer): string {
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

export async function extractTextFromStream(
  stream: AsyncIterable<Uint8Array> | Readable,
  mimeType: string,
): Promise<string> {
  const lower = (mimeType || "").toLowerCase()
  if (lower.includes("pdf")) {
    const buf = await streamToBuffer(stream)
    return extractFromPdf(buf)
  }
  if (
    lower.includes("word") ||
    lower.includes("docx") ||
    lower.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
  ) {
    const buf = await streamToBuffer(stream)
    return extractFromDocx(buf)
  }
  if (
    lower.includes("spreadsheet") ||
    lower.includes("xlsx") ||
    lower.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
  ) {
    const buf = await streamToBuffer(stream)
    return extractFromXlsx(buf)
  }
  if (lower.includes("csv")) {
    const buf = await streamToBuffer(stream)
    return extractFromCsv(buf)
  }
  if (lower.includes("html") || lower.includes("xhtml")) {
    const buf = await streamToBuffer(stream)
    return extractFromHtml(buf)
  }
  if (lower.includes("markdown") || lower.includes("md")) {
    const buf = await streamToBuffer(stream)
    return extractFromMarkdown(buf)
  }
  if (lower.includes("rtf")) {
    const buf = await streamToBuffer(stream)
    return extractFromRtf(buf)
  }
  // default: treat as utf-8 text stream
  return extractAsPlainText(stream)
}
