import {
  type ImportFormat,
  type ImportType,
  importFormats,
  importTypes,
} from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import { getImportEntry, resolveImportFileFormat } from "@chatbotx.io/imports"
import {
  createImportRowParser,
  readXlsxHeaders,
} from "@chatbotx.io/imports/parsers"
import { createByteLimitedStream } from "@chatbotx.io/imports/stream-guard"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { importService } from "./service"

const BYTES_PER_MB = 1024 * 1024

/**
 * Error codes callers may re-localize; `data.size` carries the limit in MB for
 * `importFileTooLarge`.
 */
export const importHeaderPeekErrorCodes = {
  unableToReadHeaders: "importUnableToReadHeaders",
  unsupportedFileType: "importUnsupportedFileType",
  fileTooLarge: "importFileTooLarge",
} as const

const hasErrorMessage = (error: unknown, message: string): boolean => {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message === message) {
      return true
    }
  }
  return false
}

const isMissingObjectError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "NoSuchKey" || error.name === "NotFound")

const fileTooLarge = (maxFileSizeMB: number): ChatbotXException => {
  const error = new ChatbotXException(
    `File exceeds the ${maxFileSizeMB} MB import limit`,
    importHeaderPeekErrorCodes.fileTooLarge,
  )
  error.data = { size: maxFileSizeMB }
  return error
}

/**
 * Reads only the header row of an uploaded import file so a caller can build
 * the column mapping before starting the import. The stream is byte-limited, so
 * a mislabeled oversized object is still rejected.
 */
export async function peekImportHeaders(input: {
  workspaceId: string
  fileId: string
  /**
   * Require the file to be this import type. A token-scoped caller sets it so
   * a `products` token cannot read the first row of a contacts file (and vice
   * versa); the session UI leaves it out.
   */
  type?: ImportType
}): Promise<string[]> {
  const unableToRead = () =>
    new ChatbotXException(
      "Unable to read the file headers",
      importHeaderPeekErrorCodes.unableToReadHeaders,
    )
  const unsupported = () =>
    new ChatbotXException(
      "Unsupported import file type",
      importHeaderPeekErrorCodes.unsupportedFileType,
    )

  const file = await importService.findFile({
    workspaceId: input.workspaceId,
    fileId: input.fileId,
  })
  // A file of another type is reported exactly like a missing one.
  if (!file || (input.type && file.subType !== input.type)) {
    throw unableToRead()
  }
  const importType = importTypes.safeParse(file.subType)
  if (!importType.success) {
    throw unsupported()
  }
  const { config } = getImportEntry(importType.data)
  const maxBytes = config.maxFileSizeMB * BYTES_PER_MB
  if (file.fileSize && Number(file.fileSize) > maxBytes) {
    throw fileTooLarge(config.maxFileSizeMB)
  }
  const format = resolveImportFileFormat(config, file)
  if (!format) {
    throw unsupported()
  }
  let object: Awaited<ReturnType<typeof uploader.getObjectStream>>
  try {
    object = await uploader.getObjectStream(file.path)
  } catch (error) {
    // Asked for the headers before the bytes were uploaded.
    if (isMissingObjectError(error)) {
      throw unableToRead()
    }
    throw error
  }
  if (object.contentLength != null && object.contentLength > maxBytes) {
    throw fileTooLarge(config.maxFileSizeMB)
  }
  const tooLargeMessage = `File exceeds the ${config.maxFileSizeMB} MB import limit`
  const stream = createByteLimitedStream(object.stream, {
    maxBytes,
    errorMessage: tooLargeMessage,
  })
  // `pipe` does not forward the byte guard's error to the CSV parser, so an
  // oversized stream would otherwise be an unhandled error event and leave the
  // parse waiting forever: race the parse against the guard's own error.
  const guardError = new Promise<never>((_resolve, reject) => {
    stream.once("error", reject)
  })
  try {
    return await Promise.race([readHeaders(format, stream), guardError])
  } catch (error) {
    // The byte guard reports an oversized stream as a plain Error; the XLSX
    // parser re-wraps it, keeping the original as `cause`.
    if (hasErrorMessage(error, tooLargeMessage)) {
      throw fileTooLarge(config.maxFileSizeMB)
    }
    if (error instanceof ChatbotXException) {
      throw error
    }
    // The parser failed on the bytes themselves (corrupt or mislabeled file).
    // Logged because it is also what a parser bug looks like.
    logger.warn(
      { err: error, workspaceId: input.workspaceId, fileId: input.fileId },
      "import header peek failed to parse the file",
    )
    throw unableToRead()
  } finally {
    // Only the first row is needed; release the storage connection.
    object.stream.destroy()
  }
}

async function readHeaders(
  format: ImportFormat,
  stream: ReturnType<typeof createByteLimitedStream>,
): Promise<string[]> {
  if (format === importFormats.enum.xlsx) {
    return await readXlsxHeaders(stream)
  }
  for await (const row of createImportRowParser(format, stream)) {
    return Object.keys(row)
  }
  throw new ChatbotXException(
    "Unable to read the file headers",
    importHeaderPeekErrorCodes.unableToReadHeaders,
  )
}
