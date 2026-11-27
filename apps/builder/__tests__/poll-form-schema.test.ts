import { describe, expect, test } from "vitest"
import {
  createPollFormSchema,
  pollFormSchema,
} from "@/features/polls/schema/form"

const image = { url: "https://example.com/a.png", mode: "file" as const }
const candidate = (name: string) => ({
  name,
  description: "",
  image: { url: "" },
})

const valid = {
  name: "Best pizza",
  image,
  startsAt: "2026-11-01T10:00:00.000Z",
  endsAt: "2026-11-02T10:00:00.000Z",
  afterVoteFlowId: null,
  candidates: [candidate("A"), candidate("B")],
}

describe("pollFormSchema", () => {
  test("accepts a valid poll", () => {
    expect(pollFormSchema.safeParse(valid).success).toBe(true)
  })

  test("rejects a single candidate", () => {
    const result = pollFormSchema.safeParse({
      ...valid,
      candidates: [candidate("A")],
    })
    expect(result.success).toBe(false)
  })

  test("rejects more than 10 candidates", () => {
    const result = pollFormSchema.safeParse({
      ...valid,
      candidates: Array.from({ length: 11 }, (_, i) => candidate(`C${i}`)),
    })
    expect(result.success).toBe(false)
  })

  test("rejects a 61-char candidate name", () => {
    const result = pollFormSchema.safeParse({
      ...valid,
      candidates: [candidate("x".repeat(61)), candidate("B")],
    })
    expect(result.success).toBe(false)
  })

  test("rejects a poll name over 80 chars", () => {
    expect(
      pollFormSchema.safeParse({ ...valid, name: "x".repeat(81) }).success,
    ).toBe(false)
  })

  test("rejects endsAt <= startsAt", () => {
    expect(
      pollFormSchema.safeParse({ ...valid, endsAt: valid.startsAt }).success,
    ).toBe(false)
    expect(
      pollFormSchema.safeParse({
        ...valid,
        endsAt: "2026-10-31T10:00:00.000Z",
      }).success,
    ).toBe(false)
  })

  test("requires the poll image", () => {
    expect(
      pollFormSchema.safeParse({ ...valid, image: { url: "" } }).success,
    ).toBe(false)
  })

  test("surfaces translated messages for the date range and image refines", () => {
    const schema = createPollFormSchema((key) => `T:${key}`)
    const range = schema.safeParse({ ...valid, endsAt: valid.startsAt })
    const image = schema.safeParse({ ...valid, image: { url: "" } })
    expect(range.error?.issues.map((issue) => issue.message)).toEqual([
      "T:pollManager.form.dateRangeInvalid",
    ])
    expect(image.error?.issues.map((issue) => issue.message)).toEqual([
      "T:pollManager.form.imageRequired",
    ])
  })
})
