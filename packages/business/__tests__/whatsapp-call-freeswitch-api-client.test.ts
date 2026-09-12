import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  waitForJobResult: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  getFreeswitchQueue: () => ({ add: mocks.queueAdd }),
  createQueueEvents: () => ({}),
  freeswitchQueueName: (nodeId: string) => `freeswitch:${nodeId}`,
  waitForJobResult: mocks.waitForJobResult,
}))

const { freeswitchApiClient, FreeswitchApiError, FreeswitchApiTimeoutError } =
  await import("../src/whatsapp-call/freeswitch-api-client")

beforeEach(() => {
  mocks.queueAdd.mockReset()
  mocks.waitForJobResult.mockReset()
  mocks.queueAdd.mockResolvedValue({ id: "job-1" })
})

describe("freeswitchApiClient.run", () => {
  test("resolves with the ESL reply on success", async () => {
    mocks.waitForJobResult.mockResolvedValueOnce("+OK")

    const result = await freeswitchApiClient.run("default", {
      kind: "sofiaProfileRescan",
      profile: "whatsapp",
    })

    expect(result).toEqual({ ok: true, reply: "+OK" })
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "freeswitchApi",
      expect.objectContaining({
        data: expect.objectContaining({
          command: { kind: "sofiaProfileRescan", profile: "whatsapp" },
        }),
      }),
      expect.objectContaining({ attempts: 1, removeOnComplete: true }),
    )
  })

  test("throws FreeswitchApiError when the reply itself is -ERR", async () => {
    mocks.waitForJobResult.mockResolvedValueOnce("-ERR no such gateway")

    await expect(
      freeswitchApiClient.run("default", {
        kind: "sofiaGatewayStatus",
        gateway: "wa-1",
      }),
    ).rejects.toBeInstanceOf(FreeswitchApiError)
  })

  test("throws FreeswitchApiTimeoutError when the wait rejects", async () => {
    mocks.waitForJobResult.mockRejectedValueOnce(
      new Error("Job wait freeswitchApi timed out before finishing"),
    )

    await expect(
      freeswitchApiClient.run("default", {
        kind: "sofiaGatewayStatus",
        gateway: "wa-1",
      }),
    ).rejects.toBeInstanceOf(FreeswitchApiTimeoutError)
  })

  test("a failed job (e.g. freeswitch-esl-not-connected) surfaces as FreeswitchApiError", async () => {
    mocks.waitForJobResult.mockRejectedValueOnce(
      new Error("freeswitch-esl-not-connected"),
    )

    await expect(
      freeswitchApiClient.run("default", {
        kind: "sofiaGatewayStatus",
        gateway: "wa-1",
      }),
    ).rejects.toBeInstanceOf(FreeswitchApiError)
  })
})
