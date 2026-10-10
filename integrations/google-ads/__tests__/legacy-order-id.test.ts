import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import { legacyOrderId } from "../src/apis/legacy-upload"

describe("legacyOrderId", () => {
  test.each([
    "tx-1",
    "workspace:42:contact:7:purchase",
    "ünï-çødé",
  ])("is byte-identical to v1- + first 40 hex of node sha256 (%s)", async (transactionId) => {
    const expected = `v1-${createHash("sha256").update(transactionId).digest("hex").slice(0, 40)}`
    expect(await legacyOrderId(transactionId)).toBe(expected)
  })

  test("pins a known vector", async () => {
    expect(await legacyOrderId("abc")).toBe(
      "v1-ba7816bf8f01cfea414140de5dae2223b00361a3",
    )
  })
})
