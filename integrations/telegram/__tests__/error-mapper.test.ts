import { describe, expect, test } from "vitest"
import { TelegramException } from "../src/exception"
import { integration } from "../src/integration"
import { isRevokedTokenError } from "../src/lib/error-mapper"

describe("Telegram revoked token detection", () => {
  test("recognizes unauthorized bot-token responses", () => {
    expect(
      isRevokedTokenError(new TelegramException("Unauthorized", 401)),
    ).toBe(true)
  })

  test("does not treat an upstream failure as revoked", () => {
    expect(isRevokedTokenError(new TelegramException("Unavailable", 503))).toBe(
      false,
    )
  })
})

describe("Telegram connection.describe", () => {
  test.each([
    "bot-secret",
    "bot:secret",
  ])("rejects malformed auth %j rather than exposing the bot token as sourceId", (secretText) => {
    expect(() =>
      integration.connection.describe({
        authType: "secretText",
        secretText,
      }),
    ).toThrow("Telegram auth has no bot identity")
  })
})
