// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Mocks the transaction at the module boundary and records statement order:
// the parent-row lock must be the first statement of every write transaction.

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  lockRows: [{ id: "wh-1" }] as { id: string }[],
  inserted: [] as unknown[],
  conflict: undefined as unknown,
  memberRows: [{ userId: "u1" }, { userId: "u2" }] as { userId: string }[],
  // Schedules a user is moved away from / removed from.
  movedFrom: [{ id: "wh-2" }, { id: "wh-3" }] as { id: string }[],
  removed: [{ id: "wh-2" }] as { id: string }[],
  forOptions: [] as unknown[],
  forModes: [] as string[],
}))

const makeTx = () => ({
  execute: () => {
    mocks.calls.push("advisory")
    return Promise.resolve({ rows: [] })
  },
  update: () => ({
    set: () => ({
      where: () => ({
        returning: () => {
          mocks.calls.push("lock")
          return Promise.resolve(mocks.lockRows)
        },
        // biome-ignore lint/suspicious/noThenProperty: mocks an awaitable drizzle query builder
        then: (resolve: (value: unknown) => void) => {
          mocks.calls.push("bump")
          resolve(undefined)
        },
      }),
    }),
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          for: (mode: string, options?: unknown) => {
            mocks.forOptions.push(options)
            mocks.forModes.push(mode)
            if (mode === "no key update") {
              mocks.calls.push("touch:update")
              return Promise.resolve(mocks.movedFrom)
            }
            mocks.calls.push(`members:${mode}`)
            return Promise.resolve(mocks.memberRows)
          },
        }),
        // biome-ignore lint/suspicious/noThenProperty: mocks an awaitable drizzle query builder
        then: (resolve: (value: unknown) => void) => {
          mocks.calls.push("moved")
          resolve(mocks.movedFrom)
        },
      }),
    }),
  }),
  delete: () => ({
    where: () => ({
      returning: () => {
        mocks.calls.push("delete")
        return Promise.resolve(mocks.removed)
      },
      // biome-ignore lint/suspicious/noThenProperty: mocks an awaitable drizzle query builder
      then: (resolve: (value: unknown) => void) => {
        mocks.calls.push("delete")
        resolve(undefined)
      },
    }),
  }),
  insert: () => ({
    values: (values: unknown) => {
      mocks.calls.push("insert")
      mocks.inserted.push(values)
      return Object.assign(Promise.resolve(), {
        onConflictDoUpdate: (config: unknown) => {
          mocks.calls.push("upsert")
          mocks.conflict = config
          return Promise.resolve()
        },
      })
    },
  }),
})

vi.mock("../src/client", () => ({
  db: {
    transaction: (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(makeTx()),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  ne: (...args: unknown[]) => ({ ne: args }),
  notInArray: (...args: unknown[]) => ({ notInArray: args }),
  sql: (strings: TemplateStringsArray) => ({ strings }),
}))

vi.mock("../src/schema", () => ({
  workingHoursModel: { id: "id", workspaceId: "workspaceId", name: "name" },
  workingHoursIntervalModel: { workingHoursId: "workingHoursId" },
  workspaceMemberModel: { workspaceId: "wm.workspaceId", userId: "wm.userId" },
  workingHoursMemberModel: {
    workingHoursId: "workingHoursId",
    workspaceId: "workspaceId",
    userId: "userId",
  },
}))

const { workingHoursRepository } = await import(
  "../src/repositories/working-hours/repository"
)

describe("workingHoursRepository write transactions", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.inserted.length = 0
    mocks.lockRows = [{ id: "wh-1" }]
    mocks.conflict = undefined
    mocks.memberRows = [{ userId: "u1" }, { userId: "u2" }]
    mocks.movedFrom = [{ id: "wh-2" }, { id: "wh-3" }]
    mocks.removed = [{ id: "wh-2" }]
    mocks.forOptions.length = 0
    mocks.forModes.length = 0
  })

  test("replaceIntervals locks the parent row before deleting and inserting", async () => {
    const ok = await workingHoursRepository.replaceIntervals({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
    })

    expect(ok).toBe(true)
    expect(mocks.calls).toEqual(["lock", "delete", "insert"])
  })

  test("replaceIntervals with no intervals only clears the schedule", async () => {
    await workingHoursRepository.replaceIntervals({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      intervals: [],
    })

    expect(mocks.calls).toEqual(["lock", "delete"])
  })

  test("a missing parent row reports false and writes nothing else", async () => {
    mocks.lockRows = []

    const intervals = await workingHoursRepository.replaceIntervals({
      workspaceId: "ws-other",
      workingHoursId: "wh-1",
      intervals: [{ weekday: 1, startMinute: 0, endMinute: 60 }],
    })
    const members = await workingHoursRepository.replaceMembers({
      workspaceId: "ws-other",
      workingHoursId: "wh-1",
      userIds: ["u1"],
    })

    expect([intervals, members]).toEqual([false, { status: "notFound" }])
    expect(mocks.calls).toEqual(["lock", "advisory", "lock"])
  })

  test("replaceMembers locks first, prunes, then upserts sorted so a user moves schedules without deadlocking", async () => {
    await workingHoursRepository.replaceMembers({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      userIds: ["u2", "u1", "u2"],
    })

    expect(mocks.calls).toEqual([
      "advisory",
      "lock",
      "members:key share",
      "moved",
      "touch:update",
      "bump",
      "delete",
      "insert",
      "upsert",
    ])
    // Losing parents are locked (FOR NO KEY UPDATE) and bumped BEFORE any
    // member row is written, so a concurrent schedule delete cannot form a cycle.
    expect(mocks.forModes.at(-1)).toBe("no key update")
    expect(mocks.forOptions.at(-1)).toBeUndefined()
    expect(mocks.inserted[0]).toEqual([
      { workingHoursId: "wh-1", workspaceId: "ws-1", userId: "u1" },
      { workingHoursId: "wh-1", workspaceId: "ws-1", userId: "u2" },
    ])
    expect(mocks.conflict).toMatchObject({
      target: ["workspaceId", "userId"],
      set: { workingHoursId: "wh-1" },
    })
  })

  test("replaceMembers writes nothing and reports users that are not workspace members", async () => {
    mocks.memberRows = [{ userId: "u1" }]
    const result = await workingHoursRepository.replaceMembers({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      userIds: ["u1", "u9"],
    })

    expect(result).toEqual({ status: "invalidUsers", userIds: ["u9"] })
    expect(mocks.calls).toEqual(["advisory", "lock", "members:key share"])
    expect(mocks.inserted).toEqual([])
  })

  test("replaceMembers with an empty list removes all members without inserting", async () => {
    await workingHoursRepository.replaceMembers({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      userIds: [],
    })

    expect(mocks.calls).toEqual(["advisory", "lock", "delete"])
  })

  test("replaceMembers does not bump anything when nobody moves between schedules", async () => {
    mocks.movedFrom = []

    await workingHoursRepository.replaceMembers({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      userIds: ["u1"],
    })

    expect(mocks.calls).not.toContain("touch:update")
    expect(mocks.calls).not.toContain("bump")
  })

  test("deleteMembersForUsers bumps the schedules that lost a member without waiting on locked rows", async () => {
    await workingHoursRepository.deleteMembersForUsers({
      workspaceId: "ws-1",
      userIds: ["u1"],
    })

    expect(mocks.calls).toEqual(["delete", "touch:update", "bump"])
    expect(mocks.forOptions).toEqual([{ skipLocked: true }])
  })

  test("deleteMembersForUsers leaves schedules alone when the user was on none", async () => {
    mocks.removed = []

    await workingHoursRepository.deleteMembersForUsers({
      workspaceId: "ws-1",
      userIds: ["u1"],
    })

    expect(mocks.calls).toEqual(["delete"])
  })

  test("deleteMembersForUsers with no users does nothing", async () => {
    await workingHoursRepository.deleteMembersForUsers({
      workspaceId: "ws-1",
      userIds: [],
    })

    expect(mocks.calls).toEqual([])
  })
})
