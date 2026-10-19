// @vitest-environment node
import type { AgentResponseSeriesRow } from "@chatbotx.io/analytics"
import { describe, expect, test } from "vitest"
import {
  buildAdminLabels,
  buildAgentResponseChartData,
  buildAgentResponseColorKeys,
} from "../src/utils/agent-response-series"

const row = (
  overrides: Partial<AgentResponseSeriesRow>,
): AgentResponseSeriesRow => ({
  adminId: "1",
  workspaceId: "9",
  date: "2026-10-01",
  userName: "An",
  avgResponseSeconds: 120,
  avgWorkingResponseSeconds: 90,
  avgFirstResponseSeconds: 60,
  avgWorkingFirstResponseSeconds: 30,
  responseCount: 2,
  firstResponseCount: 1,
  ...overrides,
})

describe("buildAgentResponseChartData", () => {
  test("returns no data when every value is null (empty state)", () => {
    const data = buildAgentResponseChartData({
      rows: [row({ avgWorkingResponseSeconds: null })],
      metric: "avgWorkingResponseSeconds",
      locale: "en",
    })
    expect(data).toEqual([])
  })

  test("groups by day with one series per admin, in minutes", () => {
    const data = buildAgentResponseChartData({
      rows: [
        row({}),
        row({ adminId: "2", userName: "Bình", avgWorkingResponseSeconds: 150 }),
        row({ date: "2026-10-03", avgWorkingResponseSeconds: 600 }),
      ],
      metric: "avgWorkingResponseSeconds",
      locale: "en",
    })
    expect(data).toHaveLength(3)
    expect(data[0]?.value).toEqual([
      { label: "An", value: 1.5 },
      { label: "Bình", value: 2.5 },
    ])
    expect(data[1]?.value).toEqual([])
    expect(data[2]?.value).toEqual([{ label: "An", value: 10 }])
  })

  test("omits null measures and uses the requested metric", () => {
    const data = buildAgentResponseChartData({
      rows: [
        row({ avgWorkingFirstResponseSeconds: 45 }),
        row({
          adminId: "2",
          userName: undefined,
          userEmail: "b@x.io",
          avgWorkingFirstResponseSeconds: null,
        }),
      ],
      metric: "avgWorkingFirstResponseSeconds",
      locale: "en",
    })
    expect(data[0]?.value).toEqual([{ label: "An", value: 0.8 }])
  })

  test("falls back to email then admin id for the series label", () => {
    const data = buildAgentResponseChartData({
      rows: [
        row({ userName: undefined, userEmail: "a@x.io" }),
        row({ adminId: "7", userName: undefined, userEmail: undefined }),
      ],
      metric: "avgWorkingResponseSeconds",
      locale: "en",
    })
    expect(data[0]?.value.map((v) => v.label)).toEqual(["a@x.io", "7"])
  })

  test("axis uses only returned day keys and fills gaps between them", () => {
    const data = buildAgentResponseChartData({
      rows: [row({ date: "2026-10-30" }), row({ date: "2026-11-02" })],
      metric: "avgWorkingResponseSeconds",
      locale: "en",
    })
    expect(data).toHaveLength(4)
    expect(data.map((d) => d.value.length)).toEqual([1, 0, 0, 1])
  })

  test("never adds days outside the returned keys", () => {
    const data = buildAgentResponseChartData({
      rows: [row({ date: "2026-10-05" })],
      metric: "avgWorkingResponseSeconds",
      locale: "en",
    })
    expect(data).toHaveLength(1)
  })

  test("disambiguates admins sharing a display name", () => {
    const data = buildAgentResponseChartData({
      rows: [
        row({ adminId: "1", userName: "An", userEmail: "a1@x.io" }),
        row({ adminId: "2", userName: "An", userEmail: "a2@x.io" }),
      ],
      metric: "avgWorkingResponseSeconds",
      locale: "en",
    })
    expect(data[0]?.value.map((v) => v.label)).toEqual([
      "An (a1@x.io)",
      "An (a2@x.io)",
    ])
  })

  test("falls back to the admin id when name and email both collide", () => {
    const labels = buildAdminLabels([
      { adminId: "1", userName: "An", userEmail: "same@x.io" },
      { adminId: "2", userName: "An", userEmail: "same@x.io" },
    ])
    expect(new Set(labels.values()).size).toBe(2)
    expect(labels.get("2")).toBe("An (2)")
  })

  test("never emits the reserved x-axis key as a series label", () => {
    const data = buildAgentResponseChartData({
      rows: [row({ userName: "name" })],
      metric: "avgWorkingResponseSeconds",
      locale: "en",
    })
    expect(data[0]?.value[0]?.label).not.toBe("name")
    expect(data[0]?.value[0]?.label).toBe("name (1)")
  })
})

describe("buildAgentResponseColorKeys", () => {
  const rows = [
    row({
      adminId: "20",
      userName: "Cường",
      avgWorkingFirstResponseSeconds: null,
    }),
    row({ adminId: "3", userName: "Kiêm" }),
    row({ adminId: "11", userName: "An" }),
  ]

  test("orders the unique labels by adminId, independent of row order", () => {
    const reversed = [...rows].reverse()
    expect(buildAgentResponseColorKeys(rows)).toEqual(
      buildAgentResponseColorKeys(reversed),
    )
    expect(buildAgentResponseColorKeys(rows)).toEqual(["Kiêm", "An", "Cường"])
  })

  test("contains every label used by either chart, even for an admin with no value in one metric", () => {
    const keys = buildAgentResponseColorKeys(rows)
    for (const metric of [
      "avgWorkingResponseSeconds",
      "avgWorkingFirstResponseSeconds",
    ] as const) {
      const labels = buildAgentResponseChartData({
        rows,
        metric,
        locale: "en",
      }).flatMap((day) => day.value.map((v) => v.label))
      for (const label of labels) {
        expect(keys).toContain(label)
      }
    }
  })

  test("uses the disambiguated labels when names collide", () => {
    const collide = [
      row({ adminId: "1", userName: "An", userEmail: "a@x.test" }),
      row({ adminId: "2", userName: "An", userEmail: "b@x.test" }),
    ]
    expect(buildAgentResponseColorKeys(collide)).toEqual([
      "An (a@x.test)",
      "An (b@x.test)",
    ])
  })
})
