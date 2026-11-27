import { referenceNameFromName } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { allocateUniqueName, nextFieldPosition } from "../src/pipeline/naming"

const VALID_REFERENCE = /^[a-z][a-z0-9_]*$/

describe("referenceNameFromName", () => {
  test.each([
    ["Sales", "sales"],
    ["Customer Support", "customer_support"],
    ["Bán hàng", "ban_hang"],
    ["Đàm phán", "dam_phan"],
    ["Nguồn khách", "nguon_khach"],
    ["Hỗ trợ khách hàng", "ho_tro_khach_hang"],
    ["  --VIP!!  ", "vip"],
    ["2024 Plan", "pipeline_2024_plan"],
    ["", "pipeline"],
  ])("%j becomes %j", (name, expected) => {
    expect(referenceNameFromName(name, "pipeline")).toBe(expected)
  })

  test("never exceeds 64 characters and stays valid", () => {
    const reference = referenceNameFromName("a".repeat(200), "pipeline")

    expect(reference).toHaveLength(64)
    expect(VALID_REFERENCE.test(reference)).toBe(true)
  })
})

describe("allocateUniqueName", () => {
  test("returns the candidate when it is free", () => {
    expect(allocateUniqueName("Sales", ["Support"], "name")).toBe("Sales")
  })

  test("appends the first free number", () => {
    expect(allocateUniqueName("Sales", ["Sales", "Sales 2"], "name")).toBe(
      "Sales 3",
    )
  })

  test("uses an underscore suffix for reference names", () => {
    expect(allocateUniqueName("sales", ["sales"], "referenceName")).toBe(
      "sales_2",
    )
  })

  test("truncates the base so the suffixed name still fits", () => {
    const long = "x".repeat(120)

    const next = allocateUniqueName(long, [long], "name")

    expect(next).toHaveLength(120)
    expect(next.endsWith(" 2")).toBe(true)
  })
})

describe("nextFieldPosition", () => {
  test("goes after the highest position, not the count, when a field was deleted", () => {
    expect(nextFieldPosition([{ position: 1 }, { position: 2 }])).toBe(3)
    expect(nextFieldPosition([])).toBe(0)
  })
})
