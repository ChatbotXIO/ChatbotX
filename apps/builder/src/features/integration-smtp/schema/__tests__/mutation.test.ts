import { describe, expect, test } from "vitest"
import { createSmtpRequest } from "../mutation"

describe("createSmtpRequest", () => {
  test("accepts a localhost sender for a local SMTP server", () => {
    const result = createSmtpRequest.safeParse({
      provider: "other",
      host: "localhost",
      port: 3025,
      username: "inbox",
      password: "secret",
      fromAddress: "inbox@localhost",
      imap: {
        enabled: true,
        host: "localhost",
        port: 3143,
      },
    })

    expect(result.success).toBe(true)
  })
})
