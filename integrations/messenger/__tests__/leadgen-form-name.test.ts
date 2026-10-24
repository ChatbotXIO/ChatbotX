import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: {
    get: vi.fn(),
  },
}))

// Dynamic imports ensure vi.mock is fully applied before loading these modules.
const { getLeadgenFormName } = await import("../src/apis/leadgen")
const { facebookGraphClient } = await import("../src/lib/http-client")

const mockGet = facebookGraphClient.get as MockInstance

const lookup = () =>
  getLeadgenFormName("page-1", "form-2", "page-token", "v23.0")

describe("getLeadgenFormName", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("reads only id and name of the page's forms, never their questions", async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: "form-1", name: "Other" },
        { id: "form-2", name: "Winter promo" },
      ],
    })

    await expect(lookup()).resolves.toBe("Winter promo")

    expect(mockGet).toHaveBeenCalledTimes(1)
    const [endpoint, options] = mockGet.mock.calls[0] as [
      string,
      { searchParams: Record<string, string> },
    ]
    expect(endpoint).toBe("v23.0/page-1/leadgen_forms")
    expect(options.searchParams.fields).toBe("id,name")
    expect(options.searchParams.access_token).toBe("page-token")
  })

  test("follows the paging cursor until the form is found", async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [{ id: "form-1", name: "Other" }],
        paging: { cursors: { after: "cursor-1" }, next: "https://graph/next" },
      })
      .mockResolvedValueOnce({
        data: [{ id: "form-2", name: "Winter promo" }],
      })

    await expect(lookup()).resolves.toBe("Winter promo")

    expect(mockGet).toHaveBeenCalledTimes(2)
    const [, secondOptions] = mockGet.mock.calls[1] as [
      string,
      { searchParams: Record<string, string> },
    ]
    expect(secondOptions.searchParams.after).toBe("cursor-1")
  })

  test("returns undefined when the form is not among the page's forms", async () => {
    mockGet.mockResolvedValue({ data: [{ id: "form-1", name: "Other" }] })

    await expect(lookup()).resolves.toBeUndefined()
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  test("stops after a bounded number of pages instead of walking an endless cursor", async () => {
    mockGet.mockResolvedValue({
      data: [{ id: "form-1", name: "Other" }],
      paging: { cursors: { after: "cursor-n" }, next: "https://graph/next" },
    })

    await expect(lookup()).resolves.toBeUndefined()
    expect(mockGet.mock.calls.length).toBeLessThanOrEqual(5)
  })
})
