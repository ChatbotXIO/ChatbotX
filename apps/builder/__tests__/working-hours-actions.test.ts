// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockReplaceMembers = vi.fn()
const mockDelete = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  workingHoursService: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    replaceMembers: (...args: unknown[]) => mockReplaceMembers(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

const standardClient = vi.hoisted(() => {
  const chain = {
    bindArgsSchemas: () => chain,
    inputSchema: () => chain,
    action: (fn: unknown) => fn,
  }
  return chain
})
const expiredClient = vi.hoisted(() => {
  const chain = {
    bindArgsSchemas: () => chain,
    inputSchema: () => chain,
    action: (fn: unknown) => fn,
  }
  return chain
})

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: standardClient,
  workspaceActionClientAllowExpired: expiredClient,
}))

type Action = (props: unknown) => Promise<unknown>

const { createWorkingHoursAction } = await import(
  "../src/features/working-hours/actions/create-working-hours.action"
)
const { updateWorkingHoursAction } = await import(
  "../src/features/working-hours/actions/update-working-hours.action"
)
const { replaceWorkingHoursMembersAction } = await import(
  "../src/features/working-hours/actions/replace-working-hours-members.action"
)
const { deleteWorkingHoursAction } = await import(
  "../src/features/working-hours/actions/delete-working-hours.action"
)

const row = {
  id: "wh-1",
  name: "Support",
  intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
  members: [{ userId: "u-2" }, { userId: "u-1" }],
  createdAt: new Date("2026-10-18T00:00:00Z"),
  updatedAt: new Date("2026-10-18T01:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("working-hours server actions", () => {
  test("create calls the service with the workspace id and returns the resource", async () => {
    mockCreate.mockResolvedValue(row)

    const result = await (createWorkingHoursAction as unknown as Action)({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "Support" },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: { name: "Support" },
    })
    expect(result).toMatchObject({ id: "wh-1", memberUserIds: ["u-1", "u-2"] })
  })

  test("update passes intervals through the same service as the public API", async () => {
    mockUpdate.mockResolvedValue(row)
    const intervals = [{ weekday: 1, startMinute: 540, endMinute: 1440 }]

    await (updateWorkingHoursAction as unknown as Action)({
      bindArgsParsedInputs: ["ws-1", "wh-1"],
      parsedInput: { intervals },
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      data: { intervals },
    })
  })

  test("update supports rename via the same action", async () => {
    mockUpdate.mockResolvedValue(row)

    await (updateWorkingHoursAction as unknown as Action)({
      bindArgsParsedInputs: ["ws-1", "wh-1"],
      parsedInput: { name: "Night shift" },
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      data: { name: "Night shift" },
    })
  })

  test("replace members sends the full user list (members move between schedules in the service)", async () => {
    mockReplaceMembers.mockResolvedValue(row)

    await (replaceWorkingHoursMembersAction as unknown as Action)({
      bindArgsParsedInputs: ["ws-1", "wh-1"],
      parsedInput: { userIds: ["u-1", "u-3"] },
    })

    expect(mockReplaceMembers).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
      userIds: ["u-1", "u-3"],
    })
  })

  test("delete takes both ids from bound args and no input", async () => {
    mockDelete.mockResolvedValue(undefined)

    await (deleteWorkingHoursAction as unknown as Action)({
      bindArgsParsedInputs: ["ws-1", "wh-1"],
    })

    expect(mockDelete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "wh-1",
    })
  })

  test("mutations propagate service errors", async () => {
    mockReplaceMembers.mockRejectedValue(new Error("invalid members"))

    await expect(
      (replaceWorkingHoursMembersAction as unknown as Action)({
        bindArgsParsedInputs: ["ws-1", "wh-1"],
        parsedInput: { userIds: ["nobody"] },
      }),
    ).rejects.toThrow("invalid members")
  })
})

describe("working-hours delete client", () => {
  test("delete is built on workspaceActionClientAllowExpired, the others on workspaceActionClient", async () => {
    const fs = await import("node:fs/promises")
    const dir = new URL(
      "../src/features/working-hours/actions/",
      import.meta.url,
    )
    const read = (name: string) => fs.readFile(new URL(name, dir), "utf8")

    expect(await read("delete-working-hours.action.ts")).toContain(
      "workspaceActionClientAllowExpired",
    )
    for (const name of [
      "create-working-hours.action.ts",
      "update-working-hours.action.ts",
      "replace-working-hours-members.action.ts",
    ]) {
      const source = await read(name)
      expect(source).toContain("workspaceActionClient\n")
      expect(source).not.toContain("AllowExpired")
    }
  })
})
