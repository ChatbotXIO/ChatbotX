import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upsertInbound: vi.fn(),
  attachFreeswitchUuid: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    upsertInbound: mocks.upsertInbound,
    attachFreeswitchUuid: mocks.attachFreeswitchUuid,
  },
}))

const { ensureCallRow, CallRowParticipantsUnresolvedError } = await import(
  "../src/whatsapp-call/call-row-service"
)

beforeEach(() => {
  mocks.upsertInbound.mockReset()
  mocks.attachFreeswitchUuid.mockReset()
})

describe("ensureCallRow strategy dispatch", () => {
  test("no attemptId -> inbound strategy: resolves participants then upsertInbound", async () => {
    mocks.upsertInbound.mockResolvedValueOnce({ id: "call-1" })
    const resolveParticipants = vi.fn(async () => ({
      inbox: { id: "inbox-1", workspaceId: "ws-1" },
      contactInbox: { id: "ci-1" },
      conversation: { id: "conv-1" },
    }))

    const result = await ensureCallRow({
      rootUuid: "uuid-1",
      integrationId: "iw-1",
      vars: {
        sipFromUser: "84900000000",
        sipToUser: "84911111111",
        sipHeaders: { "x-wa-meta-wacid": "wacid-1" },
      },
      resolveParticipants,
    })

    expect(resolveParticipants).toHaveBeenCalledWith({
      integrationId: "iw-1",
      from: "84900000000",
      to: "84911111111",
    })
    expect(mocks.upsertInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        wacid: "wacid-1",
        freeswitchUuid: "uuid-1",
        workspaceId: "ws-1",
        direction: "userInitiated",
        status: "ringing",
      }),
    )
    expect(mocks.attachFreeswitchUuid).not.toHaveBeenCalled()
    expect(result).toEqual({ id: "call-1" })
  })

  test("inbound strategy throws a typed error when participants cannot be resolved", async () => {
    const resolveParticipants = vi.fn(async () => null)

    await expect(
      ensureCallRow({
        rootUuid: "uuid-1",
        integrationId: "iw-1",
        vars: { sipHeaders: {} },
        resolveParticipants,
      }),
    ).rejects.toBeInstanceOf(CallRowParticipantsUnresolvedError)
    expect(mocks.upsertInbound).not.toHaveBeenCalled()
  })

  test("attemptId present -> outbound strategy: attachFreeswitchUuid, never resolves participants", async () => {
    mocks.attachFreeswitchUuid.mockResolvedValueOnce({ id: "call-2" })
    const resolveParticipants = vi.fn()

    const result = await ensureCallRow({
      rootUuid: "uuid-2",
      integrationId: "iw-1",
      vars: { attemptId: "att-1", sipHeaders: {} },
      resolveParticipants,
    })

    expect(mocks.attachFreeswitchUuid).toHaveBeenCalledWith({
      attemptId: "att-1",
      freeswitchUuid: "uuid-2",
    })
    expect(resolveParticipants).not.toHaveBeenCalled()
    expect(result).toEqual({ id: "call-2" })
  })

  test("outbound strategy propagates the repository's unknown-attempt error untouched", async () => {
    class FakeUnknownAttemptError extends Error {}
    mocks.attachFreeswitchUuid.mockRejectedValueOnce(
      new FakeUnknownAttemptError(),
    )

    await expect(
      ensureCallRow({
        rootUuid: "uuid-2",
        integrationId: "iw-1",
        vars: { attemptId: "att-missing", sipHeaders: {} },
        resolveParticipants: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(FakeUnknownAttemptError)
  })
})
