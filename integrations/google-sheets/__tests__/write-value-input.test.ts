import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  append: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
}))

// Stub the Sheets client so the actions run without real credentials. Only the
// value-writing methods matter here.
vi.mock("../src/client", () => ({
  getSheetsClient: () => ({
    spreadsheets: { values: { append: mocks.append, update: mocks.update } },
  }),
  getClient: vi.fn(),
  generateAuthUrl: vi.fn(),
  revokeToken: vi.fn(),
}))

const { integration } = await import("../src/integration")

// Actions read `getSheetsClient(ctx.auth)`; leaving auth unset skips token
// refresh and calls the handler directly.
const ctx = {} as never

beforeEach(() => {
  vi.clearAllMocks()
})

test("insertRow writes values with the RAW input option so data is stored verbatim", async () => {
  await integration.runAction("insertRow", {
    ctx,
    props: {
      spreadsheetId: "sheet-1",
      sheetName: "Sheet1",
      data: ["+84349566501", "1713491048750426"],
    },
  })

  expect(mocks.append).toHaveBeenCalledTimes(1)
  expect(mocks.append).toHaveBeenCalledWith(
    expect.objectContaining({ valueInputOption: "RAW" }),
  )
})

test("updateRow writes values with the RAW input option", async () => {
  await integration.runAction("updateRow", {
    ctx,
    props: {
      spreadsheetId: "sheet-1",
      sheetName: "Sheet1",
      rowIndex: 4,
      data: ["+84349566501"],
    },
  })

  expect(mocks.update).toHaveBeenCalledTimes(1)
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ valueInputOption: "RAW" }),
  )
})
