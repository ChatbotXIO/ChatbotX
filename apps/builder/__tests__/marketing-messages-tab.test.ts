import { describe, expect, test } from "vitest"
import {
  buildTabSearchParams,
  parseMarketingMessagesTab,
} from "@/features/facebook-marketing-messages/lib/tab"

describe("buildTabSearchParams", () => {
  test("switching to audiences sets tab and drops table-state params", () => {
    const params = buildTabSearchParams(
      "page=3&perPage=50&sort=createdAt.desc&other=1",
      "audiences",
    )
    expect(params.toString()).toBe("other=1&tab=audiences")
  })

  test("switching to campaigns removes tab and table-state params", () => {
    const params = buildTabSearchParams(
      "tab=audiences&page=2&perPage=20&sort=name.asc",
      "campaigns",
    )
    expect(params.toString()).toBe("")
  })
})

describe("statistics tab", () => {
  test("parses statistics", () => {
    expect(parseMarketingMessagesTab("statistics")).toBe("statistics")
  })

  test("switching to statistics sets tab and drops statistics + table params", () => {
    const params = buildTabSearchParams(
      "adAccountId=act_1&since=2026-01-01&until=2026-01-31&search=x&order=desc&page=2",
      "statistics",
    )
    expect(params.toString()).toBe("tab=statistics")
  })

  test("leaving statistics drops its filters", () => {
    const params = buildTabSearchParams(
      "tab=statistics&since=2026-01-01&adAccountId=act_1",
      "campaigns",
    )
    expect(params.toString()).toBe("")
  })
})
