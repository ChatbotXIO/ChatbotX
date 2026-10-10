import { afterEach, describe, expect, it, vi } from "vitest"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { get: getMock, post: postMock },
  }
})

import { publishFlowJson } from "../src/api/flow"
import type { WhatsappAuthValue } from "../src/schema"

const auth = {
  tokens: { accessToken: "tok-xyz" },
  version: "v23.0",
  metadata: { wabaId: "waba-1" },
} as unknown as WhatsappAuthValue

const jsonResponse = <T>(data: T) => ({
  json: vi.fn().mockResolvedValue(data),
})

const rejectedResponse = (error: unknown) => ({
  json: vi.fn().mockRejectedValue(error),
})

const flow = (status: string, validationErrors: unknown[] = []) =>
  jsonResponse({
    id: "flow-1",
    name: "Signup",
    status,
    categories: ["OTHER"],
    validation_errors: validationErrors,
  })

const createUrl = "https://graph.facebook.com/v23.0/waba-1/flows"
const assetsUrl = "https://graph.facebook.com/v23.0/flow-1/assets"
const publishUrl = "https://graph.facebook.com/v23.0/flow-1/publish"

const postedUrls = () => postMock.mock.calls.map(([url]) => url)

const publishNew = () =>
  publishFlowJson({ auth, params: { name: "Signup", flowJson: "{}" } })

const publishExisting = () =>
  publishFlowJson({
    auth,
    params: { name: "Signup", flowJson: "{}", existingFlowId: "flow-1" },
  })

afterEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe("publishFlowJson — new Flow", () => {
  it("creates the Flow as a draft, then publishes it explicitly", async () => {
    postMock
      .mockReturnValueOnce(jsonResponse({ id: "flow-1", success: true }))
      .mockReturnValueOnce(jsonResponse({ success: true }))
    getMock
      .mockReturnValueOnce(flow("DRAFT"))
      .mockReturnValueOnce(flow("PUBLISHED"))

    const result = await publishNew()

    expect(postedUrls()).toEqual([createUrl, publishUrl])
    expect(postMock.mock.calls[0]?.[1]?.json).not.toHaveProperty("publish")
    expect(result.published).toBe(true)
    expect(result.flow.status).toBe("PUBLISHED")
  })

  it("reports PUBLISHED when Meta accepted the publish but still reads back DRAFT", async () => {
    postMock
      .mockReturnValueOnce(jsonResponse({ id: "flow-1", success: true }))
      .mockReturnValueOnce(jsonResponse({ success: true }))
    getMock
      .mockReturnValueOnce(flow("DRAFT"))
      .mockReturnValueOnce(flow("DRAFT"))

    const result = await publishNew()

    expect(result.published).toBe(true)
    expect(result.flow.status).toBe("PUBLISHED")
  })

  it("keeps the Flow as a draft and skips publish on validation errors", async () => {
    const errors = [{ error: "INVALID_PROPERTY", message: "Bad property" }]
    postMock.mockReturnValueOnce(
      jsonResponse({ id: "flow-1", success: true, validation_errors: errors }),
    )
    getMock.mockReturnValueOnce(flow("DRAFT", errors))

    const result = await publishNew()

    expect(postedUrls()).toEqual([createUrl])
    expect(result.published).toBe(false)
    expect(result.flow.validation_errors).toEqual(errors)
  })

  it("returns the draft with Meta's reason when a publishing check refuses it", async () => {
    postMock
      .mockReturnValueOnce(jsonResponse({ id: "flow-1", success: true }))
      .mockReturnValueOnce(
        rejectedResponse({
          response: {
            error: {
              status: 400,
              code: 139_001,
              message: "(#139001) Flow publishing failed",
              error_user_msg: "Verify your business before publishing.",
            },
          },
        }),
      )
    getMock
      .mockReturnValueOnce(flow("DRAFT"))
      .mockReturnValueOnce(flow("DRAFT"))

    const result = await publishNew()

    expect(result).toMatchObject({
      published: false,
      publishError: "Verify your business before publishing.",
      flow: { id: "flow-1", status: "DRAFT" },
    })
  })
})

describe("publishFlowJson — existing Flow", () => {
  it("re-publishes a published Flow that new JSON turned back into a draft", async () => {
    postMock
      .mockReturnValueOnce(jsonResponse({ success: true }))
      .mockReturnValueOnce(jsonResponse({ success: true }))
    getMock
      .mockReturnValueOnce(flow("PUBLISHED"))
      .mockReturnValueOnce(flow("DRAFT"))
      .mockReturnValueOnce(flow("PUBLISHED"))

    const result = await publishExisting()

    expect(postedUrls()).toEqual([assetsUrl, publishUrl])
    expect(result.published).toBe(true)
  })

  it("does not call publish when the Flow is still PUBLISHED after the update", async () => {
    postMock.mockReturnValueOnce(jsonResponse({ success: true }))
    getMock
      .mockReturnValueOnce(flow("PUBLISHED"))
      .mockReturnValueOnce(flow("PUBLISHED"))

    const result = await publishExisting()

    expect(postedUrls()).toEqual([assetsUrl])
    expect(result.published).toBe(true)
  })

  it("keeps the draft on validation errors without publishing", async () => {
    const errors = [{ error: "INVALID_PROPERTY", message: "Bad property" }]
    postMock.mockReturnValueOnce(
      jsonResponse({ success: true, validation_errors: errors }),
    )
    getMock
      .mockReturnValueOnce(flow("DRAFT"))
      .mockReturnValueOnce(flow("DRAFT", errors))

    const result = await publishExisting()

    expect(postedUrls()).toEqual([assetsUrl])
    expect(result.published).toBe(false)
  })
})
