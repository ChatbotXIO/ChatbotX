import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const relativeTimeMock = vi.hoisted(() => vi.fn(() => "5 minutes ago"))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({ relativeTime: relativeTimeMock }),
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const NOW_MS = Date.parse("2026-11-08T00:05:00.000Z")
vi.mock("@/hooks/use-now", () => ({ useNow: () => NOW_MS }))

type Snapshot = {
  enabled: boolean
  roles: string[]
  isStandby: boolean
  checkedAt: string
}
const state = vi.hoisted(() => ({
  data: undefined as Snapshot | null | undefined,
  isPending: false,
  mutate: vi.fn(),
  mutationPending: false,
  mutationOptions: undefined as
    | undefined
    | { onSuccess: (data: Snapshot) => Promise<void>; onError: () => void },
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
  cancelQueries: vi.fn(),
  calls: [] as string[],
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.data, isPending: state.isPending }),
  useMutation: (options: typeof state.mutationOptions) => {
    state.mutationOptions = options
    return { mutate: state.mutate, isPending: state.mutationPending }
  },
  useQueryClient: () => ({
    cancelQueries: (...args: unknown[]) => {
      state.calls.push("cancel")
      return state.cancelQueries(...args)
    },
    setQueryData: (...args: unknown[]) => {
      state.calls.push("set")
      return state.setQueryData(...args)
    },
    invalidateQueries: state.invalidateQueries,
  }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    integrationWhatsappAPIs: {
      getWhatsappRoutingRolesAPI: {
        queryOptions: (options: unknown) => options,
        queryKey: (options: unknown) => ["roles", options],
      },
      syncWhatsappRoutingRolesAPI: {
        mutationOptions: (options: unknown) => options,
      },
      getWhatsappRoutingRolesByInboxAPI: { key: () => ["rolesByInbox"] },
    },
  },
}))

const { RoutingRolesSection } = await import(
  "@/features/integration-whatsapp/components/routing-roles-section"
)

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  enabled: true,
  roles: ["customer_service", "escalation"],
  isStandby: true,
  checkedAt: "2026-11-08T00:00:00.000Z",
  ...overrides,
})

describe("RoutingRolesSection", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () =>
    act(() => {
      root.render(
        <RoutingRolesSection integrationWhatsappId="wa-1" workspaceId="ws-1" />,
      )
    })

  beforeEach(() => {
    vi.clearAllMocks()
    state.calls = []
    state.data = snapshot()
    state.isPending = false
    state.mutationPending = false
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("lists the roles Meta reported, with standby access and check time", () => {
    render()
    expect(container.textContent).toContain(
      "conversationRouting.roles.customer_service",
    )
    expect(container.textContent).toContain(
      "conversationRouting.roles.escalation",
    )
    expect(container.textContent).toContain(
      "conversationRouting.settings.rolesStandbyOn",
    )
    expect(container.textContent).toContain('"time":"5 minutes ago"')
    // An explicit `now` (next-intl warns ENVIRONMENT_FALLBACK without one).
    expect(relativeTimeMock).toHaveBeenCalledWith(
      new Date("2026-11-08T00:00:00.000Z"),
      new Date(NOW_MS),
    )
    expect(state.mutate).not.toHaveBeenCalled()
  })

  test("a check newer than the minute ticker reads as now, never in the future", () => {
    state.data = snapshot({ checkedAt: "2026-11-08T00:05:15.000Z" })
    render()
    expect(relativeTimeMock).toHaveBeenLastCalledWith(
      new Date("2026-11-08T00:05:15.000Z"),
      new Date("2026-11-08T00:05:15.000Z"),
    )
  })

  test("never checked: shows the hint and never calls Meta by itself", () => {
    state.data = null
    render()
    expect(state.mutate).not.toHaveBeenCalled()
    expect(container.textContent).toContain(
      "conversationRouting.settings.rolesNeverChecked",
    )
  })

  test("no role, routing off and a future role each have their own copy", () => {
    state.data = snapshot({ roles: [] })
    render()
    expect(container.textContent).toContain(
      "conversationRouting.settings.rolesNone",
    )
    state.data = snapshot({ enabled: false, roles: [] })
    render()
    expect(container.textContent).toContain(
      "conversationRouting.settings.rolesNotEnabled",
    )
    state.data = snapshot({ roles: ["new_meta_role"] })
    render()
    expect(container.textContent).toContain("conversationRouting.roles.other")
  })

  test("Check again syncs and writes the answer into the query cache", async () => {
    render()
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("conversationRouting.settings.rolesRefresh"),
    )
    act(() => button?.click())
    expect(state.mutate).toHaveBeenCalledTimes(1)
    const fresh = snapshot({ roles: ["utility"] })
    await state.mutationOptions?.onSuccess(fresh)
    // An in-flight initial read is cancelled first, so it cannot overwrite.
    expect(state.cancelQueries).toHaveBeenCalledWith({
      queryKey: [
        "roles",
        { input: { workspaceId: "ws-1", integrationWhatsappId: "wa-1" } },
      ],
    })
    expect(state.calls).toEqual(["cancel", "set"])
    expect(state.setQueryData).toHaveBeenCalledWith(
      [
        "roles",
        { input: { workspaceId: "ws-1", integrationWhatsappId: "wa-1" } },
      ],
      fresh,
    )
    // The composer's inbox-keyed copy is refetched too.
    expect(state.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["rolesByInbox"],
    })
  })

  test("a failed sync toasts, brand-neutral copy", () => {
    render()
    state.mutationOptions?.onError()
    expect(toast.error).toHaveBeenCalledWith(
      "conversationRouting.settings.rolesSyncFailed",
    )
  })
})
