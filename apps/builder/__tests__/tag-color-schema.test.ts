import { describe, expect, test } from "vitest"
import { conversationContactTagResource } from "@/features/conversations/schema/resource"
import {
  createTagRequest,
  updateTagSchema,
} from "@/features/tags/schema/action"
import { publicTagResource, tagResource } from "@/features/tags/schema/resource"

describe("tag color in request schemas", () => {
  test.each([
    ["create", createTagRequest],
    ["update", updateTagSchema],
  ] as const)("%s accepts #RRGGBB in either case and stores it upper case", (_name, schema) => {
    expect(schema.parse({ name: "a", color: "#1A2B3C" }).color).toBe("#1A2B3C")
    expect(schema.parse({ name: "a", color: "#1a2b3c" }).color).toBe("#1A2B3C")
  })

  test.each([
    ["create", createTagRequest],
    ["update", updateTagSchema],
  ] as const)("%s rejects alpha and junk", (_name, schema) => {
    for (const color of ["#1A2B3C4D", "#abc", "blue", "", "#12345G"]) {
      expect(schema.safeParse({ name: "a", color }).success).toBe(false)
    }
  })

  test("update keeps omitted and null apart (omitted = unchanged, null = clear)", () => {
    expect("color" in updateTagSchema.parse({ name: "a" })).toBe(false)
    expect(updateTagSchema.parse({ name: "a", color: null }).color).toBeNull()
  })
})

describe("rows cached before the color column existed", () => {
  const cachedRow = {
    id: "1",
    name: "a",
    folderId: null,
    workspaceId: "w1",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  test("tagResource, publicTagResource and the preview resource return color null instead of failing", () => {
    expect(tagResource.parse(cachedRow).color).toBeNull()
    expect(
      publicTagResource.parse({ id: "1", name: "a", folderId: null }).color,
    ).toBeNull()
    expect(
      conversationContactTagResource.parse({ id: "1", name: "a" }).color,
    ).toBeNull()
  })
})

describe("publicTagResource", () => {
  test("includes color", () => {
    expect(
      publicTagResource.parse({
        id: "1",
        name: "a",
        folderId: null,
        color: "#112233",
      }).color,
    ).toBe("#112233")
    expect(
      publicTagResource.parse({
        id: "1",
        name: "a",
        folderId: null,
        color: null,
      }).color,
    ).toBeNull()
  })
})
