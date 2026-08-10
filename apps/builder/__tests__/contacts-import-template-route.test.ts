// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetUserAndWorkspace, mockCanAccessContactsSection } = vi.hoisted(
  () => ({
    mockGetUserAndWorkspace: vi.fn(),
    mockCanAccessContactsSection: vi.fn(),
  }),
)

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetUserAndWorkspace,
}))

vi.mock("@/features/contacts/permissions", () => ({
  canAccessContactsSection: mockCanAccessContactsSection,
}))

const UTF8_BOM_BYTES = [0xef, 0xbb, 0xbf]

const EN_TEMPLATE =
  '"Contact ID","Phone number","Email","First name","Last name"\n' +
  '"1234567890","+14155550100","john.doe@example.com","John","Doe"\n'
const VI_TEMPLATE =
  '"ID Liên hệ","Số điện thoại","Email","Tên","Họ"\n' +
  '"1234567890","+84155550100","an.nguyen@example.com","An","Nguyễn"\n'

const { GET } = await import(
  "../src/app/(no-sidebar)/space/[workspaceId]/contacts/import/template/route"
)

const callRoute = (workspaceId: string) =>
  GET(new Request("http://localhost/space/ws-1/contacts/import/template"), {
    params: Promise.resolve({ workspaceId }),
  })

const workspaceWithLanguage = (language: string) => ({
  targetWorkspace: { language },
  targetWorkspaceMember: { permissions: {} },
})

// `Response.text()` decodes as UTF-8 and strips a leading BOM per the WHATWG
// spec, so BOM presence must be asserted on the raw bytes instead.
const readRawBytes = async (res: Response) =>
  Buffer.from(await res.arrayBuffer())

describe("contacts import template download route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCanAccessContactsSection.mockReturnValue(true)
  })

  test("returns an English CSV attachment for a non-Vietnamese workspace", async () => {
    mockGetUserAndWorkspace.mockResolvedValue(workspaceWithLanguage("en"))

    const res = await callRoute("ws-1")
    const bytes = await readRawBytes(res)

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="contacts-import-template.csv"',
    )
    expect([...bytes.subarray(0, 3)]).toEqual(UTF8_BOM_BYTES)
    expect(bytes.subarray(3).toString("utf-8")).toBe(EN_TEMPLATE)
    expect(mockGetUserAndWorkspace).toHaveBeenCalledWith("ws-1")
  })

  test("returns a Vietnamese CSV attachment for a Vietnamese workspace", async () => {
    mockGetUserAndWorkspace.mockResolvedValue(workspaceWithLanguage("vi"))

    const res = await callRoute("ws-1")
    const bytes = await readRawBytes(res)

    expect(res.status).toBe(200)
    expect([...bytes.subarray(0, 3)]).toEqual(UTF8_BOM_BYTES)
    expect(bytes.subarray(3).toString("utf-8")).toBe(VI_TEMPLATE)
  })

  test("404s when the caller is not a member of the workspace", async () => {
    mockGetUserAndWorkspace.mockResolvedValue(null)

    const res = await callRoute("ws-1")

    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(mockCanAccessContactsSection).not.toHaveBeenCalled()
  })

  test("404s when the caller lacks contacts access", async () => {
    mockGetUserAndWorkspace.mockResolvedValue(workspaceWithLanguage("en"))
    mockCanAccessContactsSection.mockReturnValue(false)

    const res = await callRoute("ws-1")

    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
  })

  test("404s without checking access when workspaceId is missing", async () => {
    const res = await callRoute("")

    expect(res.status).toBe(404)
    expect(mockGetUserAndWorkspace).not.toHaveBeenCalled()
  })
})
