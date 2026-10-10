import { afterEach, describe, expect, it, vi } from "vitest"

const { getMock, postMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { get: getMock, post: postMock, delete: deleteMock },
  }
})

import { deleteFlow } from "../src/api/flow"
import type { WhatsappAuthValue } from "../src/schema"

const auth = {
  tokens: { accessToken: "tok-xyz" },
  version: "v23.0",
  metadata: { wabaId: "waba-1" },
} as unknown as WhatsappAuthValue

const jsonResponse = <T>(data: T) => ({
  json: vi.fn().mockResolvedValue(data),
})

/** A Graph API error, in the shape `parseOriginError` reads. */
const metaError = (code: number, message: string) => ({
  json: vi.fn().mockRejectedValue({
    httpStatus: 400,
    errorBody: { error: { code, message } },
  }),
})

const flow = (status: string) =>
  jsonResponse({ id: "flow-1", name: "Signup", status })

const flowUrl = "https://graph.facebook.com/v23.0/flow-1"
const deprecateUrl = `${flowUrl}/deprecate`

const run = () => deleteFlow({ auth, flowId: "flow-1" })

afterEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  deleteMock.mockReset()
})

describe("deleteFlow", () => {
  it("deletes a draft Flow", async () => {
    getMock.mockReturnValueOnce(flow("DRAFT"))
    deleteMock.mockReturnValueOnce(jsonResponse({ success: true }))

    await expect(run()).resolves.toEqual({ outcome: "deleted", status: null })
    expect(deleteMock.mock.calls[0]?.[0]).toBe(flowUrl)
    expect(postMock).not.toHaveBeenCalled()
  })

  it.each([
    "PUBLISHED",
    "THROTTLED",
    "BLOCKED",
  ])("deprecates a %s Flow, which Meta cannot delete", async (status) => {
    getMock.mockReturnValueOnce(flow(status))
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))

    await expect(run()).resolves.toEqual({
      outcome: "deprecated",
      status: "DEPRECATED",
    })
    expect(postMock.mock.calls[0]?.[0]).toBe(deprecateUrl)
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it("leaves an already deprecated Flow alone", async () => {
    getMock.mockReturnValueOnce(flow("DEPRECATED"))

    await expect(run()).resolves.toEqual({
      outcome: "skipped",
      status: "DEPRECATED",
    })
    expect(postMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it("deprecates a draft that was published after it was read (139004)", async () => {
    getMock.mockReturnValueOnce(flow("DRAFT"))
    deleteMock.mockReturnValueOnce(
      metaError(139_004, "Can't delete published Flow"),
    )
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))

    await expect(run()).resolves.toMatchObject({ outcome: "deprecated" })
    expect(postMock.mock.calls[0]?.[0]).toBe(deprecateUrl)
  })

  it("reads a Flow deprecated in the meantime as done (139003)", async () => {
    getMock
      .mockReturnValueOnce(flow("PUBLISHED"))
      .mockReturnValueOnce(flow("DEPRECATED"))
    postMock.mockReturnValueOnce(
      metaError(139_003, "Flow is already deprecated"),
    )

    await expect(run()).resolves.toEqual({
      outcome: "skipped",
      status: "DEPRECATED",
    })
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it("switches calls only once, never bouncing between them", async () => {
    getMock.mockReturnValueOnce(flow("DRAFT"))
    deleteMock.mockReturnValueOnce(
      metaError(139_004, "Can't delete published Flow"),
    )
    postMock.mockReturnValueOnce(
      metaError(139_003, "Can't deprecate unpublished flow"),
    )

    await expect(run()).rejects.toThrow()
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it("reports a Flow that no longer exists as missing", async () => {
    getMock.mockReturnValueOnce(
      metaError(100, "Flow with specified ID does not exist"),
    )

    await expect(run()).resolves.toEqual({ outcome: "missing", status: null })
    expect(postMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it("throws on an expired token instead of treating it as removed", async () => {
    getMock.mockReturnValueOnce(metaError(190, "Error validating access token"))

    await expect(run()).rejects.toThrow("Error validating access token")
  })

  it("throws on a code 100 error that is not a missing Flow", async () => {
    getMock.mockReturnValueOnce(metaError(100, "Invalid parameter"))

    await expect(run()).rejects.toThrow("Invalid parameter")
  })
})
