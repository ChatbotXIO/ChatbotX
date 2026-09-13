import { describe, expect, test } from "vitest"
import { BaseRepository } from "../src/repositories/postgres/base.repository"

/**
 * `getOccurredAt` calls `.toISOString()`, so every repository feeding it must
 * hand over real `Date` objects. A raw `db.execute(sql...)` does NOT map
 * `timestamptz` columns — it returns strings — and a hand-written
 * `as SomeRow[]` cast makes that compile anyway. This pins the contract so the
 * next person sees the requirement instead of a runtime TypeError.
 */
class ProbeRepository extends BaseRepository {
  occurredAt(
    row: Parameters<BaseRepository["getOccurredAt"]>[0],
    eventType: Parameters<BaseRepository["getOccurredAt"]>[1],
  ) {
    return this.getOccurredAt(row, eventType)
  }
}

const repository = new ProbeRepository()
const emptyRow = {
  deliveredAt: null,
  seenAt: null,
  clickedAt: null,
  failedAt: null,
}

describe("getOccurredAt requires real Date columns", () => {
  test("formats each event type from its own Date column", () => {
    const at = new Date("2026-09-11T10:00:00.000Z")

    expect(
      repository.occurredAt({ ...emptyRow, clickedAt: at }, "flow:clicked"),
    ).toBe("2026-09-11T10:00:00.000Z")
    expect(
      repository.occurredAt({ ...emptyRow, seenAt: at }, "message:seen"),
    ).toBe("2026-09-11T10:00:00.000Z")
    expect(
      repository.occurredAt({ ...emptyRow, failedAt: at }, "message:failed"),
    ).toBe("2026-09-11T10:00:00.000Z")
  })

  test("throws on a driver string, which is exactly the unmapped-column bug", () => {
    // Not a wish for this to throw — a record of why the repositories must
    // select through the query builder rather than cast raw rows.
    expect(() =>
      repository.occurredAt(
        {
          ...emptyRow,
          clickedAt: "2026-09-11 10:00:00+00" as unknown as Date,
        },
        "flow:clicked",
      ),
    ).toThrow(TypeError)
  })
})
