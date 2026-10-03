// @vitest-environment node
import { describe, expect, test } from "vitest"
import { sequenceDetailResource } from "@/features/sequences/schema/resource"

const now = new Date("2026-01-01T00:00:00.000Z")

const sequence = {
  id: "1",
  workspaceId: "2",
  folderId: null,
  name: "Welcome",
  active: true,
  subscribers: 0,
  messages: 0,
  createdAt: now,
  updatedAt: now,
}

const step = {
  id: "10",
  sequenceId: "1",
  flowId: "5",
  order: 0,
  delayDays: 1,
  delayMinutes: 0,
  delayUnit: null,
  specificDateTime: null,
  isActive: true,
  anytime: true,
  sendTimeStart: null,
  sendTimeEnd: null,
  sendDays: null,
  createdAt: now,
  updatedAt: now,
}

describe("sequenceDetailResource", () => {
  test("keeps the steps so their ids are discoverable", () => {
    const parsed = sequenceDetailResource.parse({ ...sequence, steps: [step] })

    expect(parsed.steps).toHaveLength(1)
    expect(parsed.steps[0]).toMatchObject({ id: "10", sequenceId: "1" })
  })

  test("accepts a sequence with no steps", () => {
    expect(
      sequenceDetailResource.parse({ ...sequence, steps: [] }).steps,
    ).toEqual([])
  })
})
