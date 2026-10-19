import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByWorkspace: vi.fn(),
  findOverrides: vi.fn(),
  findWorkspace: vi.fn(),
}))

vi.mock("../src/working-hours/service", () => ({
  workingHoursService: {
    listByWorkspace: mocks.listByWorkspace,
    findDateOverridesForSchedules: mocks.findOverrides,
  },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))

const { listOnShiftUserIds } = await import("../src/working-hours/on-shift")

const WS = "ws-1"
const WH = "wh-1"

describe("listOnShiftUserIds", () => {
  const monday10Utc = new Date("2026-06-01T10:00:00Z")
  const monday20Utc = new Date("2026-06-01T20:00:00Z")
  const schedule = {
    id: WH,
    workspaceId: WS,
    name: "Office",
    intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
    members: [{ userId: "scheduled" }],
  }

  beforeEach(() => {
    mocks.listByWorkspace.mockResolvedValue([schedule])
    mocks.findWorkspace.mockResolvedValue({ id: WS, timezone: "UTC" })
    mocks.findOverrides.mockResolvedValue(new Map())
  })

  test("a scheduled user is on shift inside the interval", async () => {
    const result = await listOnShiftUserIds({
      workspaceId: WS,
      userIds: ["scheduled"],
      at: monday10Utc,
    })
    expect([...result]).toEqual(["scheduled"])
  })

  test("a scheduled user is off shift outside the interval; unscheduled users stay on shift", async () => {
    const result = await listOnShiftUserIds({
      workspaceId: WS,
      userIds: ["scheduled", "free"],
      at: monday20Utc,
    })
    expect([...result]).toEqual(["free"])
  })

  test("skips the workspace lookup when no candidate has a schedule", async () => {
    const result = await listOnShiftUserIds({
      workspaceId: WS,
      userIds: ["free"],
      at: monday20Utc,
    })
    expect([...result]).toEqual(["free"])
    expect(mocks.findWorkspace).not.toHaveBeenCalled()
  })

  test("members of a schedule who are not candidates are ignored", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        ...schedule,
        members: [{ userId: "scheduled" }, { userId: "other" }],
      },
    ])

    const result = await listOnShiftUserIds({
      workspaceId: WS,
      userIds: ["scheduled", "free"],
      at: monday10Utc,
    })

    expect([...result].sort()).toEqual(["free", "scheduled"])
    expect(mocks.findOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ workingHoursIds: [WH] }),
    )
  })

  test("a date override closes a schedule that is open by its weekly intervals", async () => {
    mocks.findOverrides.mockResolvedValue(
      new Map([[WH, new Map([["2026-06-01", []]])]]),
    )

    const result = await listOnShiftUserIds({
      workspaceId: WS,
      userIds: ["scheduled"],
      at: monday10Utc,
    })

    expect([...result]).toEqual([])
    expect(mocks.findOverrides).toHaveBeenCalledWith({
      workspaceId: WS,
      workingHoursIds: [WH],
      from: monday10Utc,
      to: monday10Utc,
    })
  })

  test("a date override with hours opens a schedule that is closed by its weekly intervals", async () => {
    mocks.findOverrides.mockResolvedValue(
      new Map([
        [
          WH,
          new Map([["2026-06-01", [{ startMinute: 1140, endMinute: 1260 }]]]),
        ],
      ]),
    )

    const result = await listOnShiftUserIds({
      workspaceId: WS,
      userIds: ["scheduled"],
      at: monday20Utc,
    })

    expect([...result]).toEqual(["scheduled"])
  })
})
