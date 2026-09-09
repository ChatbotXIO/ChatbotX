import { vi } from "vitest"

/**
 * Shared fixtures + mock wiring for the WhatsApp Coexistence flush suite,
 * split across `coexist-whatsapp-flush.test.ts` (drain behaviour, ownership,
 * counters) and `coexist-whatsapp-flush.payloads.test.ts` (real Meta payload
 * shapes, patch batching, metadata reduction). Run-lifecycle behaviour lives
 * in `coexist-whatsapp-flush-lifecycle.test.ts`.
 *
 * `vi.mock` is file-scoped in Vitest, so each file keeps its own mock block
 * and hands the mock functions to `createFlushHarness` here — the wiring
 * itself is written once.
 */

export const runId = "run-1"
export const phoneNumberId = "phone-456"
export const CLAIM_TOKEN = "claim-token-1"

export const fakeIntegration = {
  id: "int-1",
  workspaceId: "ws-1",
  phoneNumberId,
  coexistEnabled: true,
  coexistAiReadsSyncedHistory: false,
  inboxId: "inbox-1",
}

export const fakeInbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "whatsapp",
}

export const makeStagedRow = (id: string, waId = "601234567890") => ({
  id,
  phoneNumberId,
  processedAt: null,
  payload: {
    contacts: [{ wa_id: waId, profile: { name: "Alice" } }],
    history: [
      {
        threads: [
          {
            id: waId,
            messages: [
              {
                id: `msg-${id}`,
                from: waId,
                timestamp: "1700000000",
                type: "text",
                text: { body: "Hello" },
              },
            ],
          },
        ],
      },
    ],
  },
})

export const defaultRunRow = () => ({
  workspaceId: "ws-1",
  currentPageNumber: 0,
  attempts: 0,
  importedContactCount: 0,
  importedMessageCount: 0,
  skippedCount: 0,
  failedCount: 0,
  currentScan: 0,
  // History-lifecycle resume state (see brief-coexist-history-lifecycle.md):
  // a fresh run has seen no Meta history metadata and carries no pending
  // patches, so it can never be terminal on entry.
  lastPhase: null,
  lastChunkOrder: null,
  syncProgress: 0,
  pendingPatches: null,
})

export const emptyBulkResult = (
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  importedContacts: 0,
  importedMessages: 0,
  skippedContacts: 0,
  skippedMessages: 0,
  failedMessages: 0,
  contactInboxIds: new Map<string, string>(),
  insertedAttachmentIds: [] as string[],
  ...overrides,
})

export const makeEchoRow = (id: string, waId = "601234567890") => ({
  id,
  phoneNumberId,
  processedAt: null,
  payload: {
    metadata: { phone_number_id: phoneNumberId },
    smb_message_echoes: [
      {
        id: `echo-${id}`,
        from: "business-self",
        to: waId,
        timestamp: "1700000123",
        type: "text",
        text: { body: "Hi from business" },
      },
    ],
  },
})

export const makeDeclinedRow = (id: string) => ({
  id,
  phoneNumberId,
  processedAt: null,
  payload: {
    metadata: { phone_number_id: phoneNumberId },
    history: [
      {
        errors: [{ code: 2_593_109, title: "History sharing declined" }],
      },
    ],
  },
})

export const makeMetadataRow = (id: string, waId = "601234567890") => ({
  id,
  phoneNumberId,
  processedAt: null,
  payload: {
    contacts: [{ wa_id: waId, profile: { name: "Alice" } }],
    history: [
      {
        metadata: { phase: 2, chunk_order: 5, progress: 100 },
        threads: [
          {
            id: waId,
            messages: [
              {
                id: `msg-${id}`,
                from: waId,
                timestamp: "1700000000",
                type: "text",
                text: { body: "Hello" },
              },
            ],
          },
        ],
      },
    ],
  },
})

type Mock = ReturnType<typeof vi.fn>

export type FlushHarnessMocks = {
  mockClaimRun: Mock
  mockRunWrite: Mock
  mockSelect: Mock
  mockUpdate: Mock
}

export function createFlushHarness(mocks: FlushHarnessMocks) {
  /** The integration `findByPhoneNumberId` resolves; null means "gone". */
  let currentIntegration: Record<string, unknown> | null = null
  let lastStagedChain: { orderBy: Mock } | null = null

  const setIntegration = (value: Record<string, unknown> | null) => {
    currentIntegration = value
  }

  /**
   * Wires the production call graph:
   *   1. `integrationWhatsappRepository.findByPhoneNumberId` (select … limit 1)
   *   2. `coexistService.claimRunWithNewToken` → the claimed run row + ownership token
   *   3. `whatsappCoexistStagingRepository.listPending` (select … orderBy … limit)
   *
   * The staged select returns `stagedRows` on the first batch call and `[]` on
   * every subsequent call, so the drain loop terminates deterministically.
   */
  const wireSelect = (
    runRow: ReturnType<typeof defaultRunRow> | null,
    stagedRows: unknown[],
  ) => {
    mocks.mockClaimRun.mockResolvedValue(
      runRow ? { id: runId, claimToken: CLAIM_TOKEN, ...runRow } : null,
    )

    const integrationChain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    }
    integrationChain.from.mockReturnValue(integrationChain)
    integrationChain.where.mockReturnValue(integrationChain)
    integrationChain.limit.mockImplementation(() =>
      Promise.resolve(currentIntegration ? [currentIntegration] : []),
    )

    const stagedChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    stagedChain.from.mockReturnValue(stagedChain)
    stagedChain.where.mockReturnValue(stagedChain)
    stagedChain.orderBy.mockReturnValue(stagedChain)
    stagedChain.limit.mockResolvedValueOnce(stagedRows).mockResolvedValue([])

    mocks.mockSelect
      .mockReturnValueOnce(integrationChain)
      .mockReturnValue(stagedChain)
    lastStagedChain = stagedChain
  }

  /**
   * `affectedByCall` decides, per RUN-level write (0-based), how many rows it
   * reports — the hook the ownership tests use to simulate a teardown or a
   * reclaim landing after the claim. Staging/integration writes stay on the
   * `db` seam and always succeed.
   */
  const wireUpdateChain = (
    affectedByCall: (callIndex: number) => number = () => 1,
  ) => {
    let callIndex = -1
    mocks.mockRunWrite.mockImplementation(() => {
      callIndex += 1
      return Promise.resolve(affectedByCall(callIndex))
    })

    mocks.mockUpdate.mockImplementation(() => {
      const chain = { set: vi.fn(), where: vi.fn() }
      chain.set.mockReturnValue(chain)
      chain.where.mockResolvedValue(undefined)
      return chain
    })
  }

  /** Every field payload written this test — run writes first, then staging. */
  const allSetPayloads = (): Record<string, unknown>[] => [
    ...mocks.mockRunWrite.mock.calls.map(
      (args) => args[0] as Record<string, unknown>,
    ),
    ...mocks.mockUpdate.mock.results
      .flatMap((r) => {
        const value = r.value as { set?: Mock } | undefined
        return value?.set?.mock.calls ?? []
      })
      .map((args) => args[0] as Record<string, unknown>),
  ]

  /** The `expect` guard each run-level write carried. */
  const allRunWriteGuards = (): unknown[] =>
    mocks.mockRunWrite.mock.calls.map((args) => args[1])

  return {
    setIntegration,
    wireSelect,
    wireUpdateChain,
    allSetPayloads,
    allRunWriteGuards,
    get lastStagedChain() {
      return lastStagedChain
    },
  }
}
