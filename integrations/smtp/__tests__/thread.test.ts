import { describe, expect, test } from "vitest"
import { emailThreadKey } from "../src/inbound/thread"

describe("emailThreadKey", () => {
  test("uses the root reference before a direct parent", () => {
    expect(
      emailThreadKey({
        messageId: "<reply@example.com>",
        inReplyTo: "<parent@example.com>",
        references: ["<root@example.com>", "<parent@example.com>"],
      }),
    ).toBe("<root@example.com>")
  })

  test("uses the direct parent when references are absent", () => {
    expect(
      emailThreadKey({
        messageId: "<reply@example.com>",
        inReplyTo: "<parent@example.com>",
        references: [],
      }),
    ).toBe("<parent@example.com>")
  })

  test("uses the message id for a root message", () => {
    expect(
      emailThreadKey({
        messageId: "<root@example.com>",
        references: [],
      }),
    ).toBe("<root@example.com>")
  })
})
