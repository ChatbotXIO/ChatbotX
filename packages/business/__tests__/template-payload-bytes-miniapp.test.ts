// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  MAX_PAYLOAD_BYTES,
  payloadTooManyBytesExceptionFor,
} from "../src/template/snapshot-limits"

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

describe("payloadTooManyBytesExceptionFor", () => {
  test("names Mini App embedded images when Mini Apps alone exceed the cap", () => {
    const resources = { miniApps: ["x".repeat(MAX_PAYLOAD_BYTES + 10)] }
    const error = payloadTooManyBytesExceptionFor(resources, bytes(resources))
    expect(error.code).toBe("templatePayloadTooManyBytesMiniApps")
    expect(error.message).toContain("Mini App")
  })

  test("names Mini Apps when they are most of the payload", () => {
    const resources = { miniApps: ["x".repeat(900)], flows: ["y".repeat(100)] }
    const error = payloadTooManyBytesExceptionFor(resources, bytes(resources))
    expect(error.code).toBe("templatePayloadTooManyBytesMiniApps")
  })

  test("keeps the generic error when Mini Apps are a small share", () => {
    const resources = { miniApps: ["x".repeat(10)], flows: ["y".repeat(900)] }
    const error = payloadTooManyBytesExceptionFor(resources, bytes(resources))
    expect(error.code).toBe("templatePayloadTooManyBytes")
  })

  test("keeps the generic error without Mini Apps", () => {
    const error = payloadTooManyBytesExceptionFor({ flows: ["y"] }, 10)
    expect(error.code).toBe("templatePayloadTooManyBytes")
  })
})
