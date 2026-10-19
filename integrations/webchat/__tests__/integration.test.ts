import { describe, expect, test } from "vitest"
import { integration } from "../src/integration"

describe("webchat self-serve config fields", () => {
  test("exposes schema constraints in the connection catalog", () => {
    const fields = integration.connection?.configFields ?? []

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "brandColor",
          pattern: "^#[0-9A-Fa-f]{6}$",
        }),
        expect.objectContaining({
          name: "conversationStarters",
          items: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: "flowId",
                format: "bigint-string",
              }),
            ]),
          }),
        }),
      ]),
    )
  })
})
