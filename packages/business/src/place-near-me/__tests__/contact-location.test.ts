import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listValuesByKeys: vi.fn(),
}))

vi.mock("../../contact-custom-field/service", () => ({
  contactCustomFieldService: { listValuesByKeys: mocks.listValuesByKeys },
}))

const { findContactLocation } = await import("../contact-location")

const input = { workspaceId: "ws1", contactId: "c1", keys: ["f1", "f2"] }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("findContactLocation", () => {
  test("returns the newest valid value", async () => {
    mocks.listValuesByKeys.mockResolvedValue([
      { key: "f2", value: "10.5,20.25", updatedAt: new Date(2) },
      { key: "f1", value: "1,2", updatedAt: new Date(1) },
    ])

    await expect(findContactLocation(input)).resolves.toEqual({
      latitude: 10.5,
      longitude: 20.25,
    })
    expect(mocks.listValuesByKeys).toHaveBeenCalledWith(input)
  })

  test("falls through invalid newest value", async () => {
    mocks.listValuesByKeys.mockResolvedValue([
      { key: "f2", value: "hello", updatedAt: new Date(2) },
      { key: "f1", value: "1,2", updatedAt: new Date(1) },
    ])

    await expect(findContactLocation(input)).resolves.toEqual({
      latitude: 1,
      longitude: 2,
    })
  })

  test("returns null when there are no rows", async () => {
    mocks.listValuesByKeys.mockResolvedValue([])

    await expect(findContactLocation(input)).resolves.toBeNull()
  })
})
