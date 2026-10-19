// @vitest-environment node
import type { HumanAgentStats } from "@chatbotx.io/analytics"
import { describe, expect, test } from "vitest"
import {
  buildResponseTimeColumns,
  RESPONSE_TIME_COLUMN_SPECS,
  responseSecondsAccessor,
} from "../src/components/charts/admins-response-time-columns"

const stat = (
  adminId: string,
  avgWorkingResponseSeconds: number | null,
): HumanAgentStats =>
  ({
    adminId,
    avgResponseSeconds: null,
    avgWorkingResponseSeconds,
    avgFirstResponseSeconds: null,
    avgWorkingFirstResponseSeconds: null,
  }) as unknown as HumanAgentStats

const identity = ((key: string) => key) as never

describe("admins response-time columns", () => {
  test("defines four columns in the documented order", () => {
    expect(RESPONSE_TIME_COLUMN_SPECS.map((s) => s.key)).toEqual([
      "avgResponseSeconds",
      "avgWorkingResponseSeconds",
      "avgFirstResponseSeconds",
      "avgWorkingFirstResponseSeconds",
    ])
    expect(
      buildResponseTimeColumns(identity, "en").every(
        (c) => c.enableSorting === true,
      ),
    ).toBe(true)
  })

  test("maps null to undefined so TanStack can sort it last", () => {
    expect(
      responseSecondsAccessor(stat("a", null), "avgWorkingResponseSeconds"),
    ).toBeUndefined()
    expect(
      responseSecondsAccessor(stat("a", 0), "avgWorkingResponseSeconds"),
    ).toBe(0)
  })

  test("sorts null last in both directions via sortUndefined", () => {
    for (const column of buildResponseTimeColumns(identity, "en")) {
      expect(column.sortUndefined).toBe("last")
      const accessor = (
        column as { accessorFn: (r: HumanAgentStats) => unknown }
      ).accessorFn
      expect(accessor(stat("n", null))).toBeUndefined()
    }
  })
})
