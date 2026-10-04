// @vitest-environment node

/**
 * `integrationWhatsappService.disconnect` has no dedicated business-level
 * test today — `apps/builder/__tests__/disconnect-whatsapp-action.test.ts`
 * fakes the whole method instead of exercising the real one ("Mirrors
 * `integrationWhatsappService.disconnect`'s real transaction body ... rather
 * than mocking `@chatbotx.io/business` transitively"), so NEITHER the
 * legacy `inboxService.disconnect` fallback NOR the `connectionStateService
 * .transition` FSM path it writes through today is ever exercised against
 * the real implementation. This file only overrides the handful of calls
 * `disconnect` itself makes (`importOriginal` keeps every other export —
 * including transitively-imported ones like `MESSENGER_PAGE_ID_UNIQUE_
 * CONSTRAINT` — real, so this doesn't have to re-mock the whole schema
 * surface by hand), mirroring the sibling
 * `integration-{telegram,tiktok,zalo,threads}-service.test.ts` files.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteByIntegration: vi.fn(async () => undefined),
  deleteIfOrphaned: vi.fn(async () => undefined),
  findByInboxId: vi.fn(async () => undefined),
  transition: vi.fn(async () => undefined),
  disconnectInbox: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/database/repositories")
  >()),
  connectionRepository: { findByInboxId: mocks.findByInboxId },
  metaCapiEventRepository: { deleteByIntegration: mocks.deleteByIntegration },
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: mocks.disconnectInbox },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mocks.disconnectInbox },
}))

vi.mock("../src/whatsapp-business-account/service", () => ({
  whatsappBusinessAccountService: { deleteIfOrphaned: mocks.deleteIfOrphaned },
}))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

const integrationWhatsappRow = {
  id: "integration-1",
  inboxId: "inbox-1",
  phoneNumberId: "phone-1",
  wabaId: "waba-1",
} as never

const makeTx = () =>
  ({
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  }) as never

describe("integrationWhatsappService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates inbox disconnection to the connection state service", async () => {
    mocks.findByInboxId.mockResolvedValueOnce(undefined)
    const tx = makeTx()

    await integrationWhatsappService.disconnect({
      integrationWhatsapp: integrationWhatsappRow,
      ownerId: "owner-1",
      workspaceId: "ws-1",
      tx,
    })

    expect(mocks.disconnectInbox).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "ws-1",
      tx,
    })
  })
})
