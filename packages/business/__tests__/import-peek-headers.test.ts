// @vitest-environment node
import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFile: vi.fn(),
  getObjectStream: vi.fn(),
}))

vi.mock("../src/import/service", () => ({
  importService: { findFile: mocks.findFile },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getObjectStream: mocks.getObjectStream },
}))

const { peekImportHeaders, importHeaderPeekErrorCodes } = await import(
  "../src/import/peek-headers"
)

const input = { workspaceId: "ws-1", fileId: "f-1" }
const csvFile = {
  subType: "contacts",
  fileName: "people.csv",
  mimeType: "text/csv",
  path: "workspaces/ws-1/imports/contacts/a.csv",
  fileSize: 100,
}

const streamOf = (text: string, contentLength?: number) => ({
  stream: Readable.from([Buffer.from(text)]),
  contentLength,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("peekImportHeaders", () => {
  test("returns the first row's column names for a CSV file", async () => {
    mocks.findFile.mockResolvedValue(csvFile)
    mocks.getObjectStream.mockResolvedValue(
      streamOf("Phone,First name\n+8490,Ann\n"),
    )

    await expect(peekImportHeaders(input)).resolves.toEqual([
      "Phone",
      "First name",
    ])
    expect(mocks.findFile).toHaveBeenCalledWith(input)
  })

  test("reports an unknown file as unable to read", async () => {
    mocks.findFile.mockResolvedValue(undefined)

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unableToReadHeaders,
    })
  })

  test("rejects a file whose subType is not an import type", async () => {
    mocks.findFile.mockResolvedValue({ ...csvFile, subType: "generic" })

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unsupportedFileType,
    })
  })

  test("rejects a MIME/extension the import type does not accept", async () => {
    mocks.findFile.mockResolvedValue({ ...csvFile, mimeType: "image/png" })

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unsupportedFileType,
    })
    expect(mocks.getObjectStream).not.toHaveBeenCalled()
  })

  test("rejects a recorded size over the limit before reading storage", async () => {
    mocks.findFile.mockResolvedValue({ ...csvFile, fileSize: 21 * 1024 * 1024 })

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.fileTooLarge,
      data: { size: 20 },
    })
    expect(mocks.getObjectStream).not.toHaveBeenCalled()
  })

  test("rejects an object whose real content length is over the limit", async () => {
    mocks.findFile.mockResolvedValue({ ...csvFile, fileSize: null })
    mocks.getObjectStream.mockResolvedValue(
      streamOf("a,b\n1,2\n", 21 * 1024 * 1024),
    )

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.fileTooLarge,
    })
  })

  test("an empty file has no headers to read", async () => {
    mocks.findFile.mockResolvedValue(csvFile)
    mocks.getObjectStream.mockResolvedValue(streamOf(""))

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unableToReadHeaders,
    })
  })

  test("a file of another import type is reported as unreadable when a type is required", async () => {
    mocks.findFile.mockResolvedValue({ ...csvFile, subType: "products" })

    await expect(
      peekImportHeaders({ ...input, type: "contacts" }),
    ).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unableToReadHeaders,
    })
    expect(mocks.getObjectStream).not.toHaveBeenCalled()
  })

  test("a file of the required type is read", async () => {
    mocks.findFile.mockResolvedValue(csvFile)
    mocks.getObjectStream.mockResolvedValue(streamOf("Phone\n+8490\n"))

    await expect(
      peekImportHeaders({ ...input, type: "contacts" }),
    ).resolves.toEqual(["Phone"])
  })

  test("an object that was never uploaded is unreadable, not a server error", async () => {
    mocks.findFile.mockResolvedValue(csvFile)
    mocks.getObjectStream.mockRejectedValue(
      Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
      }),
    )

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unableToReadHeaders,
    })
  })

  test("other storage failures still surface", async () => {
    mocks.findFile.mockResolvedValue(csvFile)
    mocks.getObjectStream.mockRejectedValue(new Error("connection reset"))

    await expect(peekImportHeaders(input)).rejects.toThrow("connection reset")
  })

  test("bytes that are not a valid XLSX workbook are unreadable", async () => {
    mocks.findFile.mockResolvedValue({
      ...csvFile,
      subType: "products",
      fileName: "items.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    mocks.getObjectStream.mockResolvedValue(streamOf("a,b\n1,2\n"))

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unableToReadHeaders,
    })
  })

  test("an oversized stream is fileTooLarge when no content length is reported", async () => {
    mocks.findFile.mockResolvedValue({ ...csvFile, fileSize: null })
    // 21 MB > the 20 MB contacts limit, one line with no newline.
    mocks.getObjectStream.mockResolvedValue({
      stream: Readable.from([Buffer.alloc(21 * 1024 * 1024, "a")]),
    })

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.fileTooLarge,
      data: { size: 20 },
    })
  })

  test("an object whose reported length is over the limit still releases its stream", async () => {
    mocks.findFile.mockResolvedValue({ ...csvFile, fileSize: null })
    const stream = Readable.from([Buffer.from("a,b\n")])
    mocks.getObjectStream.mockResolvedValue({
      stream,
      contentLength: 21 * 1024 * 1024,
    })

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.fileTooLarge,
    })
    expect(stream.destroyed).toBe(true)
  })

  test("a connection error on the storage stream after it opened is unreadable, not a hang", async () => {
    mocks.findFile.mockResolvedValue(csvFile)
    const stream = new Readable({
      read() {
        // Never produces data: the test destroys the stream with an error.
      },
    })
    mocks.getObjectStream.mockResolvedValue({ stream })
    setTimeout(() => stream.destroy(new Error("ECONNRESET")), 5)

    await expect(peekImportHeaders(input)).rejects.toMatchObject({
      code: importHeaderPeekErrorCodes.unableToReadHeaders,
    })
  })
})
