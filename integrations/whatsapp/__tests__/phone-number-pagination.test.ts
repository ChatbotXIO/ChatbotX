import { beforeEach, describe, expect, test, vi } from "vitest"

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: {
      get: getMock,
    },
  }
})

const { listPhoneNumbers } = await import("../src/api/phone-number")

const response = (body: unknown) => ({
  json: vi.fn().mockResolvedValue(body),
})

const phoneNumber = (id: string) => ({
  id,
  verified_name: `Phone ${id}`,
  code_verification_status: "VERIFIED",
  display_phone_number: `+1 555 ${id}`,
  quality_rating: "GREEN",
  platform_type: "CLOUD_API",
  throughput: {},
  webhook_configuration: {},
})

describe("listPhoneNumbers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns phone numbers from every Graph API page", async () => {
    getMock
      .mockReturnValueOnce(
        response({
          data: [phoneNumber("1001")],
          paging: {
            cursors: { before: "a", after: "b" },
            next: "https://graph.facebook.com/v23.0/waba/phone_numbers?after=b",
          },
        }),
      )
      .mockReturnValueOnce(
        response({
          data: [phoneNumber("1002")],
          paging: { cursors: { before: "b", after: "c" } },
        }),
      )

    const result = await listPhoneNumbers({
      wabaId: "waba",
      accessToken: "token",
      version: "v23.0",
    })

    expect(result.data.map((item) => item.id)).toEqual(["1001", "1002"])
    expect(result.paging.next).toBeUndefined()
    expect(getMock).toHaveBeenCalledTimes(2)
    expect(String(getMock.mock.calls[0]?.[0])).toContain("limit=100")
    expect(getMock.mock.calls[1]?.[0]).toBe(
      "https://graph.facebook.com/v23.0/waba/phone_numbers?after=b",
    )
  })

  test("stops when paging.next points to the current page", async () => {
    const loopingUrl =
      "https://graph.facebook.com/v23.0/waba/phone_numbers?limit=100"
    getMock.mockReturnValue(
      response({
        data: [phoneNumber("1001")],
        paging: {
          cursors: { before: "a", after: "a" },
          next: loopingUrl,
        },
      }),
    )

    await listPhoneNumbers({
      wabaId: "waba",
      accessToken: "token",
      version: "v23.0",
    })

    expect(getMock).toHaveBeenCalledTimes(1)
  })

  test("returns the phone numbers when Meta omits paging", async () => {
    getMock.mockReturnValueOnce(response({ data: [phoneNumber("1001")] }))

    const result = await listPhoneNumbers({
      wabaId: "waba",
      accessToken: "token",
      version: "v23.0",
    })

    expect(result.data.map((item) => item.id)).toEqual(["1001"])
    expect(result.paging.cursors).toEqual({ before: "", after: "" })
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  test("does not send the access token to a next URL on another origin", async () => {
    getMock.mockReturnValue(
      response({
        data: [phoneNumber("1001")],
        paging: {
          cursors: { before: "a", after: "b" },
          next: "https://attacker.example/graph/phone_numbers?after=b",
        },
      }),
    )

    const result = await listPhoneNumbers({
      wabaId: "waba",
      accessToken: "token",
      version: "v23.0",
    })

    expect(result.data.map((item) => item.id)).toEqual(["1001"])
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(String(getMock.mock.calls[0]?.[0])).toContain(
      "https://graph.facebook.com/",
    )
  })

  test("fails instead of returning a truncated phone-number list", async () => {
    getMock.mockImplementation((url: string) =>
      response({
        data: [phoneNumber(`phone-${getMock.mock.calls.length}`)],
        paging: {
          cursors: { before: "a", after: "b" },
          next: `${url}&after=${getMock.mock.calls.length}`,
        },
      }),
    )

    await expect(
      listPhoneNumbers({
        wabaId: "waba",
        accessToken: "token",
        version: "v23.0",
      }),
    ).rejects.toThrow("Graph pagination exceeded 20 pages")

    expect(getMock).toHaveBeenCalledTimes(20)
  })
})
