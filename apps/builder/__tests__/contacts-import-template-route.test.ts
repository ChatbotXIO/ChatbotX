// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockRequireContactsAccess, mockFindById, mockNotFound } = vi.hoisted(
  () => ({
    mockRequireContactsAccess: vi.fn(),
    mockFindById: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("not found")
    }),
  }),
)

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireContactsAccess: mockRequireContactsAccess,
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    findById: mockFindById,
  },
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}))

const UTF8_BOM_BYTES = [0xef, 0xbb, 0xbf]

const { GET } = await import(
  "../src/app/(no-sidebar)/space/[workspaceId]/contacts/import/template/route"
)

const callRoute = (workspaceId: string) =>
  GET(new Request("http://localhost/space/ws-1/contacts/import/template"), {
    params: Promise.resolve({ workspaceId }),
  })

// `Response.text()` decodes as UTF-8 and strips a leading BOM per the WHATWG
// spec, so BOM presence must be asserted on the raw bytes instead.
const readRawBytes = async (res: Response) =>
  Buffer.from(await res.arrayBuffer())

describe("contacts import template download route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireContactsAccess.mockResolvedValue(undefined)
  })

  test("returns an English-header CSV attachment for a non-Vietnamese workspace", async () => {
    mockFindById.mockResolvedValue({ language: "en" })

    const res = await callRoute("ws-1")
    const bytes = await readRawBytes(res)

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="contacts-import-template.csv"',
    )
    expect([...bytes.subarray(0, 3)]).toEqual(UTF8_BOM_BYTES)
    expect(bytes.subarray(3).toString("utf-8")).toBe(
      '"Contact ID","Phone number","Email","First name","Last name"\n',
    )
    expect(mockRequireContactsAccess).toHaveBeenCalledWith("ws-1")
    expect(mockFindById).toHaveBeenCalledWith({ id: "ws-1" })
  })

  test("returns a Vietnamese-header CSV attachment for a Vietnamese workspace", async () => {
    mockFindById.mockResolvedValue({ language: "vi" })

    const res = await callRoute("ws-1")
    const bytes = await readRawBytes(res)

    expect(res.status).toBe(200)
    expect([...bytes.subarray(0, 3)]).toEqual(UTF8_BOM_BYTES)
    expect(bytes.subarray(3).toString("utf-8")).toBe(
      '"ID Liên hệ","Số điện thoại","Email","Tên","Họ"\n',
    )
  })

  test("propagates the access-denied rejection without loading the workspace", async () => {
    mockRequireContactsAccess.mockRejectedValue(new Error("not found"))

    await expect(callRoute("ws-1")).rejects.toThrow("not found")
    expect(mockFindById).not.toHaveBeenCalled()
  })

  test("404s without checking access or loading the workspace when workspaceId is missing", async () => {
    await expect(callRoute("")).rejects.toThrow("not found")
    expect(mockRequireContactsAccess).not.toHaveBeenCalled()
    expect(mockFindById).not.toHaveBeenCalled()
  })
})
