import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The reconcile-tenants handler walks the UNION of white-label owners and
// active-tenant owners, so one pass both provisions newly-upgraded resellers
// and downgrades churned ones. It must dedupe owners that appear in both lists
// (a provisioned reseller is in both), short-circuit on an empty union, and
// keep going if one owner's reconcile throws.
// ---------------------------------------------------------------------------

const state = {
  whiteLabelOwnerIds: [] as string[],
  activeOwnerIds: [] as string[],
  reconciled: [] as string[],
  reconciledOptions: [] as ({ skipDowngrade?: boolean } | undefined)[],
  throwFor: null as string | null,
}

vi.mock("@chatbotx.io/business", () => ({
  userQuotaService: {
    listWhiteLabelOwnerIds: vi.fn(() =>
      Promise.resolve(state.whiteLabelOwnerIds),
    ),
  },
  tenantService: {
    listActiveOwnerIds: vi.fn(() => Promise.resolve(state.activeOwnerIds)),
    reconcileOwnerEntitlement: vi.fn(
      (ownerId: string, options?: { skipDowngrade?: boolean }) => {
        state.reconciledOptions.push(options)
        if (ownerId === state.throwFor) {
          return Promise.reject(new Error("boom"))
        }
        state.reconciled.push(ownerId)
        return Promise.resolve()
      },
    ),
  },
}))

// Real AsyncLocalStorage context, isolated from the audit dispatcher's
// Snowflake id generator — this test only needs the wrapped calls to
// succeed, not a real enqueue.
vi.mock("@chatbotx.io/business/audit", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks")
  const storage = new AsyncLocalStorage<Record<string, unknown>>()
  return {
    SYSTEM_ACTOR: "system",
    withAuditContext: (actor: Record<string, unknown>, fn: () => unknown) =>
      storage.run(actor, fn),
    getAuditActor: () => storage.getStore(),
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { reconcileTenants } = await import(
  "../src/schedule/handlers/reconcile-tenants"
)

describe("reconcileTenants handler", () => {
  beforeEach(() => {
    state.whiteLabelOwnerIds = []
    state.activeOwnerIds = []
    state.reconciled = []
    state.reconciledOptions = []
    state.throwFor = null
  })

  test("reconciles the deduped union of white-label and active-tenant owners", async () => {
    state.whiteLabelOwnerIds = ["a", "b"]
    state.activeOwnerIds = ["b", "c"]

    await reconcileTenants()

    expect([...state.reconciled].sort()).toEqual(["a", "b", "c"])
  })

  test("no-ops when both lists are empty", async () => {
    await reconcileTenants()

    expect(state.reconciled).toEqual([])
  })

  test("one failing owner does not abort the batch", async () => {
    state.whiteLabelOwnerIds = ["a", "b", "c"]
    state.throwFor = "b"

    await reconcileTenants()

    expect([...state.reconciled].sort()).toEqual(["a", "c"])
  })

  test("skips downgrades when the candidate batch exceeds the circuit breaker threshold", async () => {
    // 21 active-tenant owners with no white-label entitlement = 21 downgrade
    // candidates, above the 20 threshold.
    state.activeOwnerIds = Array.from({ length: 21 }, (_, i) => `owner-${i}`)

    await reconcileTenants()

    expect(state.reconciled).toHaveLength(21)
    expect(
      state.reconciledOptions.every((options) => options?.skipDowngrade),
    ).toBe(true)
  })

  test("does not skip downgrades at the circuit breaker threshold", async () => {
    state.activeOwnerIds = Array.from({ length: 19 }, (_, i) => `owner-${i}`)

    await reconcileTenants()

    expect(
      state.reconciledOptions.every((options) => !options?.skipDowngrade),
    ).toBe(true)
  })

  test("provision/reactivate candidates (white-label owners) are never skipped", async () => {
    // White-label owners are never downgrade candidates, regardless of batch size.
    state.whiteLabelOwnerIds = Array.from(
      { length: 25 },
      (_, i) => `wl-owner-${i}`,
    )

    await reconcileTenants()

    expect(
      state.reconciledOptions.every((options) => !options?.skipDowngrade),
    ).toBe(true)
  })
})
