import { db } from "@chatbotx.io/database/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { resourceDeletionLogService } from "../src/resource-deletion-log/service"
import { userService } from "../src/user/service"
import { workspaceService } from "../src/workspace/service"
import { workspaceMemberService } from "../src/workspace-member/service"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("userService.requestAccountDeletion", () => {
  test("returns the original deadline without repeating side effects", async () => {
    const scheduledDeletionAt = new Date("2026-11-13T12:00:00.000Z")
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: () =>
              Promise.resolve([
                {
                  deletionRequestedAt: new Date("2026-11-12T12:00:00.000Z"),
                  id: "user-1",
                  scheduledDeletionAt,
                },
              ]),
          }),
        }),
      }),
    }
    const finalize = vi
      .spyOn(
        workspaceMemberService,
        "finalizeAccountDeletionMembershipRemovals",
      )
      .mockResolvedValue()
    vi.spyOn(db, "transaction").mockImplementation(
      async (run: (tx: unknown) => Promise<unknown>) => await run(transaction),
    )

    const result = await userService.requestAccountDeletion({
      actor: { userId: "user-1" },
      userId: "user-1",
    })

    expect(result).toEqual({ scheduledDeletionAt })
    expect(finalize).toHaveBeenCalledWith([])
  })

  test("schedules owned workspaces, revokes credentials, and records the request", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const transaction = {
      delete: vi.fn(() => ({ where: deleteWhere })),
      query: {
        tenantModel: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              for: () =>
                Promise.resolve([
                  {
                    deletionRequestedAt: null,
                    id: "user-1",
                    scheduledDeletionAt: null,
                  },
                ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () =>
              Promise.resolve([
                { id: "workspace-1", scheduledDeletionAt: null },
                {
                  id: "workspace-2",
                  scheduledDeletionAt: new Date("2026-11-13T12:00:00.000Z"),
                },
              ]),
          }),
        }),
      update: vi.fn(() => ({
        set: () => ({ where: updateWhere }),
      })),
    }
    const scheduleDeletion = vi
      .spyOn(workspaceService, "scheduleDeletion")
      .mockResolvedValue({} as never)
    const removeMembers = vi
      .spyOn(workspaceMemberService, "removeForAccountDeletion")
      .mockResolvedValue([{ userId: "user-1", workspaceId: "workspace-3" }])
    const finalize = vi
      .spyOn(
        workspaceMemberService,
        "finalizeAccountDeletionMembershipRemovals",
      )
      .mockResolvedValue()
    const recordRequest = vi
      .spyOn(resourceDeletionLogService, "recordRequest")
      .mockResolvedValue()
    vi.spyOn(db, "transaction").mockImplementation(
      async (run: (tx: unknown) => Promise<unknown>) => await run(transaction),
    )

    const result = await userService.requestAccountDeletion({
      actor: { userId: "user-1" },
      userId: "user-1",
    })

    expect(result.scheduledDeletionAt).toBeInstanceOf(Date)
    expect(scheduleDeletion).toHaveBeenCalledWith({
      actorId: "user-1",
      id: "workspace-1",
      tx: transaction,
    })
    expect(removeMembers).toHaveBeenCalledWith({
      tx: transaction,
      userId: "user-1",
    })
    expect(recordRequest).toHaveBeenCalledWith({
      requestedByUserId: "user-1",
      resource: { id: "user-1", type: "user" },
      status: "pending",
      tx: transaction,
    })
    expect(transaction.delete).toHaveBeenCalledTimes(6)
    expect(transaction.update).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledWith([
      { userId: "user-1", workspaceId: "workspace-3" },
    ])
  })
})

describe("userService.purgeDeletedUser", () => {
  test("completes the pending deletion record after deleting a due user", async () => {
    const user = {
      deletionRequestedAt: new Date("2026-11-11T12:00:00.000Z"),
      id: "user-1",
      scheduledDeletionAt: new Date("2026-11-12T11:00:00.000Z"),
    }
    const transaction = {
      delete: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: user.id }]),
        }),
      }),
      query: {
        workspaceModel: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    }
    vi.spyOn(userService, "findById").mockResolvedValue(user as never)
    vi.spyOn(resourceDeletionLogService, "findPendingId").mockResolvedValue(
      "deletion-log-1",
    )
    const complete = vi
      .spyOn(resourceDeletionLogService, "completePending")
      .mockResolvedValue(1)
    vi.spyOn(db, "transaction").mockImplementation(
      async (run: (tx: unknown) => Promise<unknown>) => await run(transaction),
    )

    await expect(userService.purgeDeletedUser(user.id)).resolves.toBe(true)
    expect(complete).toHaveBeenCalledWith({
      id: "deletion-log-1",
      tx: transaction,
    })
  })

  test("is an idempotent no-op after an earlier run deleted the user", async () => {
    vi.spyOn(userService, "findById").mockResolvedValue(undefined)
    const transaction = vi.spyOn(db, "transaction")

    await expect(userService.purgeDeletedUser("user-1")).resolves.toBe(false)
    expect(transaction).not.toHaveBeenCalled()
  })
})
