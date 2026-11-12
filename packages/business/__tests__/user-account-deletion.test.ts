import { db } from "@chatbotx.io/database/client"
// biome-ignore lint/performance/noNamespaceImport: replaces the imported batch drainer in place
import * as conversationRepository from "@chatbotx.io/database/repositories"
import {
  auditLogRepository,
  authAccountRepository,
  contactNoteRepository,
  conversationParticipantRepository,
  mobileRefreshTokenRepository,
  oauthAccessTokenRepository,
  oauthConsentRepository,
  oauthRefreshTokenRepository,
  sessionRepository,
  userDeviceTokenRepository,
  userRepository,
  workspaceRepository,
} from "@chatbotx.io/database/repositories"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { resourceDeletionLogService } from "../src/resource-deletion-log/service"
import { userService } from "../src/user/service"
import { workspaceService } from "../src/workspace/service"
import { workspaceMemberService } from "../src/workspace-member/service"

const dueUser = {
  deletionRequestedAt: new Date("2026-11-11T12:00:00.000Z"),
  id: "user-1",
  scheduledDeletionAt: new Date("2026-11-12T11:00:00.000Z"),
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const mockTransaction = (transaction: Record<string, unknown> = {}) => {
  transaction.execute ??= vi.fn()
  vi.spyOn(db, "transaction").mockImplementation(
    async (run: (tx: unknown) => Promise<unknown>) => await run(transaction),
  )
}

describe("userService.requestAccountDeletion", () => {
  test("returns the original deadline without repeating side effects", async () => {
    const scheduledDeletionAt = new Date("2026-11-13T12:00:00.000Z")
    const finalize = vi
      .spyOn(
        workspaceMemberService,
        "finalizeAccountDeletionMembershipRemovals",
      )
      .mockResolvedValue()
    const markDeletionRequested = vi
      .spyOn(userRepository, "markDeletionRequested")
      .mockResolvedValue()
    vi.spyOn(userRepository, "findForAccountDeletion").mockResolvedValue({
      ...dueUser,
      scheduledDeletionAt,
    } as never)
    mockTransaction()

    await expect(
      userService.requestAccountDeletion({
        actor: { userId: "user-1" },
        userId: "user-1",
      }),
    ).resolves.toEqual({ scheduledDeletionAt })

    expect(markDeletionRequested).not.toHaveBeenCalled()
    expect(finalize).toHaveBeenCalledWith([])
  })

  test("schedules owned workspaces, revokes credentials, and records the request", async () => {
    const transaction = {
      query: {
        tenantModel: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    }
    vi.spyOn(userRepository, "findForAccountDeletion").mockResolvedValue({
      ...dueUser,
      deletionRequestedAt: null,
      scheduledDeletionAt: null,
    } as never)
    vi.spyOn(workspaceRepository, "listByOwner").mockResolvedValue([
      { id: "workspace-1", scheduledDeletionAt: null },
      {
        id: "workspace-2",
        scheduledDeletionAt: new Date("2026-11-13T12:00:00.000Z"),
      },
    ])
    vi.spyOn(workspaceService, "scheduleDeletion").mockResolvedValue(
      {} as never,
    )
    vi.spyOn(
      workspaceMemberService,
      "removeForAccountDeletion",
    ).mockResolvedValue([{ userId: "user-1", workspaceId: "workspace-3" }])
    vi.spyOn(
      workspaceMemberService,
      "finalizeAccountDeletionMembershipRemovals",
    ).mockResolvedValue()
    vi.spyOn(resourceDeletionLogService, "recordRequest").mockResolvedValue()
    vi.spyOn(userRepository, "markDeletionRequested").mockResolvedValue()
    vi.spyOn(sessionRepository, "deleteByUserId").mockResolvedValue()
    vi.spyOn(
      mobileRefreshTokenRepository,
      "revokeAllForUser",
    ).mockResolvedValue()
    vi.spyOn(userDeviceTokenRepository, "deleteByUserId").mockResolvedValue()
    vi.spyOn(oauthAccessTokenRepository, "deleteByUserId").mockResolvedValue(0)
    vi.spyOn(oauthConsentRepository, "deleteByUserId").mockResolvedValue(0)
    vi.spyOn(oauthRefreshTokenRepository, "deleteByUserId").mockResolvedValue(0)
    vi.spyOn(authAccountRepository, "clearTokensByUserId").mockResolvedValue()
    mockTransaction(transaction)

    const result = await userService.requestAccountDeletion({
      actor: { userId: "user-1" },
      userId: "user-1",
    })

    expect(result.scheduledDeletionAt).toBeInstanceOf(Date)
    expect(workspaceService.scheduleDeletion).toHaveBeenCalledWith({
      actorId: "user-1",
      id: "workspace-1",
      tx: transaction,
    })
    expect(mobileRefreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      transaction,
    )
    expect(authAccountRepository.clearTokensByUserId).toHaveBeenCalledWith(
      "user-1",
      transaction,
    )
  })
})

describe("userService.purgeDeletedUser", () => {
  test("drains every reference table in bounded batches until no rows remain", async () => {
    mockTransaction()
    vi.spyOn(conversationRepository, "unassignUserBatch")
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    vi.spyOn(auditLogRepository, "detachUserBatch").mockResolvedValue(0)
    vi.spyOn(contactNoteRepository, "detachAuthorBatch").mockResolvedValue(0)
    vi.spyOn(
      conversationParticipantRepository,
      "deleteByUserBatch",
    ).mockResolvedValue(0)

    await expect(userService.drainUserReferences("user-1")).resolves.toBe(true)

    expect(conversationRepository.unassignUserBatch).toHaveBeenCalledTimes(2)
    expect(contactNoteRepository.detachAuthorBatch).toHaveBeenCalledWith(
      "user-1",
      5000,
      expect.anything(),
    )
  })

  test("postpones a pending reference drain so it cannot starve the due queue", async () => {
    vi.spyOn(userService, "findById").mockResolvedValue(dueUser as never)
    vi.spyOn(workspaceRepository, "listByOwner").mockResolvedValue([])
    vi.spyOn(userService, "drainUserReferences").mockResolvedValue(false)
    vi.spyOn(userRepository, "postponePurge").mockResolvedValue()

    await expect(userService.purgeDeletedUser(dueUser.id)).resolves.toBe(
      "pending",
    )

    expect(userRepository.postponePurge).toHaveBeenCalledWith({
      userId: "user-1",
      until: new Date("2026-11-12T13:00:00.000Z"),
    })
  })

  test("reschedules an owned workspace whose deletion was canceled", async () => {
    vi.spyOn(userService, "findById").mockResolvedValue(dueUser as never)
    vi.spyOn(workspaceRepository, "listByOwner").mockResolvedValue([
      { id: "workspace-1", scheduledDeletionAt: null },
    ])
    vi.spyOn(workspaceService, "scheduleDeletion").mockResolvedValue(
      {} as never,
    )
    vi.spyOn(userRepository, "postponePurge").mockResolvedValue()

    await expect(userService.purgeDeletedUser(dueUser.id)).resolves.toBe(
      "pending",
    )

    expect(workspaceService.scheduleDeletion).toHaveBeenCalledWith({
      actorId: "user-1",
      id: "workspace-1",
    })
  })

  test("postpones a failed purge so one user cannot block the due queue", async () => {
    const failure = new Error("database timeout")
    vi.spyOn(userService, "findById").mockResolvedValue(dueUser as never)
    vi.spyOn(workspaceRepository, "listByOwner").mockResolvedValue([])
    vi.spyOn(userService, "drainUserReferences").mockRejectedValue(failure)
    vi.spyOn(userRepository, "postponePurge").mockResolvedValue()

    await expect(userService.purgeDeletedUser(dueUser.id)).rejects.toBe(failure)

    expect(userRepository.postponePurge).toHaveBeenCalledWith({
      userId: "user-1",
      until: new Date("2026-11-12T13:00:00.000Z"),
    })
  })

  test("completes the pending deletion record after deleting a due user", async () => {
    vi.spyOn(userService, "findById").mockResolvedValue(dueUser as never)
    vi.spyOn(workspaceRepository, "listByOwner").mockResolvedValue([])
    vi.spyOn(userService, "drainUserReferences").mockResolvedValue(true)
    vi.spyOn(userRepository, "deleteIfDue").mockResolvedValue(true)
    vi.spyOn(resourceDeletionLogService, "findPendingId").mockResolvedValue(
      "deletion-log-1",
    )
    const complete = vi
      .spyOn(resourceDeletionLogService, "completePending")
      .mockResolvedValue(1)
    mockTransaction()

    await expect(userService.purgeDeletedUser(dueUser.id)).resolves.toBe(
      "deleted",
    )

    expect(complete).toHaveBeenCalledWith({
      id: "deletion-log-1",
      tx: expect.anything(),
    })
  })

  test("is an idempotent no-op after an earlier run deleted the user", async () => {
    vi.spyOn(userService, "findById").mockResolvedValue(undefined)
    const transaction = vi.spyOn(db, "transaction")

    await expect(userService.purgeDeletedUser("user-1")).resolves.toBe("notDue")

    expect(transaction).not.toHaveBeenCalled()
  })
})
