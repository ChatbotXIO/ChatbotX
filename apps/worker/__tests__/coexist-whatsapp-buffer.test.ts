import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock function references so they are available inside vi.mock factories
// (vi.mock calls are hoisted to the top of the file by Vitest)
// ---------------------------------------------------------------------------

const { mockInsert, mockFindFirst, mockQueueAdd } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockFindFirst: vi.fn(),
  mockQueueAdd: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mockInsert,
    update: vi.fn(),
    select: vi.fn(),
    query: {
      integrationWhatsappModel: { findFirst: mockFindFirst },
      integrationMessengerModel: { findFirst: vi.fn() },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  findOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    coexistWhatsappBuffer: "coexistWhatsappBuffer",
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistMessengerSync: "coexistMessengerSync",
  },
  integrationQueue: { add: mockQueueAdd },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  whatsappCoexistStagingModel: {
    id: "id",
    phoneNumberId: "phoneNumberId",
    processedAt: "processedAt",
  },
  coexistSyncRunModel: { id: "id" },
  integrationWhatsappModel: {},
  inboxModel: {},
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "test-id-123",
  }
})

// ---------------------------------------------------------------------------
// Import handler after mocks are registered
// ---------------------------------------------------------------------------

import { coexistWhatsappBuffer } from "../src/integration/handlers/coexist/whatsapp-buffer"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Builds a chainable Drizzle insert stub supporting two call patterns:
 * 1. staging row: .insert(staging).values(...).onConflictDoNothing()
 * 2. run row: .insert(run).values(...).returning([{id:'run-1'}])
 */
const makeInsertChain = () => {
  mockInsert.mockImplementation(() => {
    const chain = {
      values: vi.fn(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([{ id: "run-1" }]),
    }
    chain.values.mockReturnValue(chain)
    return chain
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("coexistWhatsappBuffer", () => {
  const phoneNumberId = "phone-123"
  const payload = { entry: [{ changes: [] }] }

  beforeEach(() => {
    vi.clearAllMocks()
    makeInsertChain()
  })

  it("inserts a row into whatsapp_coexist_staging keyed by phoneNumberId with payload preserved", async () => {
    // Integration must exist — buffer now validates ownership BEFORE insert to
    // avoid orphaned staging rows from a webhook with an unknown phoneNumberId.
    mockFindFirst.mockResolvedValue({
      phoneNumberId,
      coexistEnabled: false,
      inboxId: "inbox-1",
    })

    await coexistWhatsappBuffer({ phoneNumberId, payload })

    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockInsert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId, payload }),
    )
  })

  it("enqueues a single coalesced coexistWhatsappFlush when coexistEnabled === true", async () => {
    mockFindFirst.mockResolvedValue({
      id: "int-1",
      workspaceId: "ws-1",
      phoneNumberId,
      coexistEnabled: true,
      inboxId: "inbox-1",
    })

    await coexistWhatsappBuffer({ phoneNumberId, payload })

    // Exactly one flush, keyed by the fixed dedup jobId so burst webhooks
    // coalesce. Draining rows staged during an active flush is the flush
    // handler's job (post-drain tail re-check), not a per-webhook follow-up.
    expect(mockQueueAdd).toHaveBeenCalledTimes(1)
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "coexistWhatsappFlush",
      expect.objectContaining({ data: { phoneNumberId } }),
      expect.objectContaining({ jobId: `coexist-flush-${phoneNumberId}` }),
    )
  })

  it("does NOT enqueue flush when coexistEnabled === false", async () => {
    mockFindFirst.mockResolvedValue({
      phoneNumberId,
      coexistEnabled: false,
      inboxId: "inbox-1",
    })

    await coexistWhatsappBuffer({ phoneNumberId, payload })

    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  it("does NOT enqueue flush when integration is not found", async () => {
    mockFindFirst.mockResolvedValue(null)

    await coexistWhatsappBuffer({ phoneNumberId, payload })

    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // M2 — the buffer must NOT emit a per-webhook follow-up flush. A unique-jobId
  // follow-up per webhook caused queue churn during multi-hour history
  // backfills. Coalescing late rows is the flush handler's post-drain
  // tail re-check (see coexistWhatsappFlush), not the buffer's job.
  // ─────────────────────────────────────────────────────────────────────────

  it("M2: enqueues only the coalesced flush — no per-webhook follow-up job", async () => {
    mockFindFirst.mockResolvedValue({
      id: "int-1",
      workspaceId: "ws-1",
      phoneNumberId,
      coexistEnabled: true,
      inboxId: "inbox-1",
    })

    await coexistWhatsappBuffer({ phoneNumberId, payload })

    const jobIds = mockQueueAdd.mock.calls.map(
      (args) => (args[2] as Record<string, unknown> | undefined)?.jobId,
    )
    // Single enqueue with the fixed coalescing jobId — no unique follow-up.
    expect(jobIds).toEqual([`coexist-flush-${phoneNumberId}`])
  })
})
