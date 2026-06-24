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
    reconcileOwnerEntitlement: vi.fn((ownerId: string) => {
      if (ownerId === state.throwFor) {
        return Promise.reject(new Error("boom"))
      }
      state.reconciled.push(ownerId)
      return Promise.resolve()
    }),
  },
}))

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
})
