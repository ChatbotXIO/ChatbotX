import type { PipelineType } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  filterPipelineList,
  paginateList,
} from "../src/features/pipelines/lib/search-params"

const row = (name: string, type: PipelineType) => ({ pipeline: { name, type } })

const rows = [
  row("Sales Q4", "opportunity"),
  row("Hỗ trợ khách hàng", "ticket"),
  row("Onboarding", "custom"),
]

const names = (
  result: ReturnType<typeof filterPipelineList<(typeof rows)[number]>>,
) => result.map((entry) => entry.pipeline.name)

describe("filterPipelineList", () => {
  test("no filter keeps every pipeline in order", () => {
    expect(names(filterPipelineList(rows, { name: "", type: [] }))).toEqual([
      "Sales Q4",
      "Hỗ trợ khách hàng",
      "Onboarding",
    ])
  })

  test("name matches a case-insensitive substring, including accents", () => {
    expect(
      names(filterPipelineList(rows, { name: "sales", type: [] })),
    ).toEqual(["Sales Q4"])
    expect(
      names(filterPipelineList(rows, { name: "KHÁCH", type: [] })),
    ).toEqual(["Hỗ trợ khách hàng"])
  })

  test("a blank name is ignored", () => {
    expect(filterPipelineList(rows, { name: "   ", type: [] })).toHaveLength(3)
  })

  test("types match any of the selected values", () => {
    expect(
      names(filterPipelineList(rows, { name: "", type: ["ticket", "custom"] })),
    ).toEqual(["Hỗ trợ khách hàng", "Onboarding"])
  })

  test("name and type combine with AND", () => {
    expect(
      filterPipelineList(rows, { name: "sales", type: ["ticket"] }),
    ).toEqual([])
  })
})

describe("paginateList", () => {
  const numbers = Array.from({ length: 23 }, (_, index) => index + 1)

  test("slices the requested page and counts pages", () => {
    expect(paginateList(numbers, 2, 10)).toEqual({
      rows: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      pageCount: 3,
    })
    expect(paginateList(numbers, 3, 10).rows).toEqual([21, 22, 23])
  })

  test("a page past the end shows the last page", () => {
    expect(paginateList(numbers, 9, 10).rows).toEqual([21, 22, 23])
  })

  test("page and size below one are clamped", () => {
    expect(paginateList(numbers, 0, 0)).toEqual({ rows: [1], pageCount: 23 })
  })

  test("an empty list still has one page", () => {
    expect(paginateList([], 1, 10)).toEqual({ rows: [], pageCount: 1 })
  })
})
