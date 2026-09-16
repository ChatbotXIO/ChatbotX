import { describe, expect, test } from "vitest"
import { toBullMqSafeIdSegment } from "../src/id"

describe("toBullMqSafeIdSegment", () => {
  test("replaces BullMQ-unsafe characters while preserving safe segments", () => {
    expect(toBullMqSafeIdSegment("wamid:abc/123?x=1._-")).toBe(
      "wamid_abc_123_x_1._-",
    )
  })
})
