// @vitest-environment node
import { describe, expect, test } from "vitest"
import { listEmailTopicsPublicRequest } from "@/features/email-topics/schema/public"

describe("listEmailTopicsPublicRequest sort", () => {
  test("accepts a sort and keeps it optional", () => {
    expect(
      listEmailTopicsPublicRequest.parse({
        sort: [{ id: "name", desc: false }],
      }).sort,
    ).toEqual([{ id: "name", desc: false }])
    expect(listEmailTopicsPublicRequest.parse({}).sort).toBeUndefined()
  })
})
