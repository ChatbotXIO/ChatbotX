import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getMe: vi.fn(),
  deleteWebhook: vi.fn(),
  registerWebhook: vi.fn(),
}))

vi.mock("../src/apis/bot", () => ({
  connect: mocks.connect,
  getMe: mocks.getMe,
  deleteWebhook: mocks.deleteWebhook,
  registerWebhook: mocks.registerWebhook,
}))

const { integration } = await import("../src/integration")
const connection = integration.connection

if (!connection) {
  throw new Error("telegram integration has no connection block")
}

describe("telegram connection.describe", () => {
  test("derives sourceId from the bot-id prefix of the token, not a constant", () => {
    const descriptor = connection.describe({
      authType: "secretText",
      secretText: "123456789:AAExampleSecretPart",
    })
    expect(descriptor.sourceId).toBe("123456789")
  })

  test("two different bot tokens never collapse to the same sourceId", () => {
    const first = connection.describe({
      authType: "secretText",
      secretText: "111:secret-a",
    })
    const second = connection.describe({
      authType: "secretText",
      secretText: "222:secret-b",
    })
    expect(first.sourceId).not.toBe(second.sourceId)
  })
})

describe("telegram connection.fromCredentials", () => {
  test("live-validates the bot token and returns a secretText auth value", async () => {
    mocks.connect.mockResolvedValue({ id: "123456789", username: "my_bot" })
    if (!connection.fromCredentials) {
      throw new Error("telegram connection has no fromCredentials")
    }
    const auth = await connection.fromCredentials({
      secretText: "123456789:AAExampleSecretPart",
    })
    expect(mocks.connect).toHaveBeenCalledWith({
      botToken: "123456789:AAExampleSecretPart",
    })
    expect(auth).toEqual({
      authType: "secretText",
      secretText: "123456789:AAExampleSecretPart",
    })
  })

  test("rejects an invalid bot token by rethrowing the getMe failure", async () => {
    mocks.connect.mockRejectedValue(new Error("Unauthorized"))
    if (!connection.fromCredentials) {
      throw new Error("telegram connection has no fromCredentials")
    }
    await expect(
      connection.fromCredentials({ secretText: "bad-token" }),
    ).rejects.toThrow("Unauthorized")
  })
})

describe("telegram connection.verify", () => {
  const auth = { authType: "secretText" as const, secretText: "123:secret" }

  test("returns ok:true when getMe succeeds", async () => {
    mocks.getMe.mockResolvedValue({ id: "123", username: "my_bot" })
    await expect(connection.verify({ auth })).resolves.toEqual({ ok: true })
  })

  test("returns a ConnectionHealth failure instead of throwing when the token is revoked", async () => {
    mocks.getMe.mockRejectedValue(new Error("Unauthorized"))
    const health = await connection.verify({ auth })
    expect(health.ok).toBe(false)
  })
})
