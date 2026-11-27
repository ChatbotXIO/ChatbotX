import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactSyncDialog } from "@/features/contact-sync/components/contact-sync-dialog"

/** Echoes the key (plus params) back so assertions never depend on copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode
    href: string
    onClick?: () => void
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const invalidators = vi.hoisted(() => ({
  contactSyncs: vi.fn(),
  contacts: vi.fn(),
  tags: vi.fn(),
  customFields: vi.fn(),
}))
vi.mock("@/features/contact-sync/hooks/use-invalidate-contact-syncs", () => ({
  useInvalidateContactSyncs: () => invalidators.contactSyncs,
}))
vi.mock("@/features/contacts/hooks/use-contacts", () => ({
  useInvalidateContacts: () => invalidators.contacts,
}))
vi.mock("@/features/tags/provider/tag-hook", () => ({
  useInvalidateTags: () => invalidators.tags,
}))
vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useInvalidateCustomFields: () => invalidators.customFields,
}))

vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  allInboxConfigs: {
    messenger: { label: "Messenger" },
    whatsapp: { label: "WhatsApp" },
  },
}))

type QueryState = {
  isPending?: boolean
  isError?: boolean
  data?: unknown
}
const queryStates = vi.hoisted(
  () => ({}) as Record<"availability" | "sources", QueryState>,
)
const queryEnabled = vi.hoisted(
  () => ({}) as Record<string, boolean | undefined>,
)

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { __key: "availability" | "sources" }) =>
    queryStates[options.__key],
}))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactSyncAPIs: {
      getAvailability: {
        queryOptions: (options: { enabled?: boolean }) => {
          queryEnabled.availability = options.enabled
          return { ...options, __key: "availability" }
        },
      },
      listSources: {
        queryOptions: (options: { enabled?: boolean }) => {
          queryEnabled.sources = options.enabled
          return { ...options, __key: "sources" }
        },
      },
    },
  },
}))

type StartOptions = {
  onSuccess?: (args: { data?: { runId: string } }) => void
  onError?: (args: {
    error: { serverError?: string; validationErrors?: { _errors?: string[] } }
  }) => void
}
const execute = vi.hoisted(() => vi.fn())
const actionState = vi.hoisted(() => ({
  options: {} as StartOptions,
  isPending: false,
}))
vi.mock("@/features/contact-sync/actions/contact-sync.action", () => ({
  startContactSyncAction: { bind: vi.fn(() => ({})) },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: StartOptions) => {
    actionState.options = options
    return { execute, isPending: actionState.isPending }
  },
}))

vi.mock("@/features/contact-sync/components/contact-sync-progress", () => ({
  ContactSyncProgress: ({
    runId,
    onSettled,
  }: {
    runId: string
    onSettled: () => void
  }) => (
    <div data-run-id={runId} data-testid="progress">
      <button data-testid="settle" onClick={onSettled} type="button" />
    </div>
  ),
}))
vi.mock("@/features/contact-sync/components/contact-sync-mapping", () => ({
  ContactSyncMapping: ({ inboxId }: { inboxId: string }) => (
    <div data-inbox-id={inboxId} data-testid="mapping" />
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => (
    <div data-open={String(open)} data-testid="dialog">
      <button
        data-testid="open-dialog"
        onClick={() => onOpenChange?.(true)}
        type="button"
      />
      {children}
    </div>
  ),
  DialogTrigger: ({ render }: { render: React.ReactElement }) => render,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    render,
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    render?: React.ReactElement
  }) => render ?? <button {...rest}>{children}</button>,
}))
vi.mock("@chatbotx.io/ui/components/ui/label", () => ({
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode
    htmlFor?: string
  }) => <label htmlFor={htmlFor}>{children}</label>,
}))
vi.mock("@chatbotx.io/ui/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    disabled,
    id,
    onCheckedChange,
  }: {
    checked: boolean
    disabled?: boolean
    id: string
    onCheckedChange: (checked: boolean) => void
  }) => (
    <input
      checked={checked}
      disabled={disabled}
      id={id}
      onChange={(event) => onCheckedChange(event.target.checked)}
      type="checkbox"
    />
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/switch", () => ({
  Switch: ({
    checked,
    id,
    onCheckedChange,
  }: {
    checked: boolean
    id: string
    onCheckedChange: (checked: boolean) => void
  }) => (
    <input
      aria-checked={checked}
      checked={checked}
      id={id}
      onChange={(event) => onCheckedChange(event.target.checked)}
      role="switch"
      type="checkbox"
    />
  ),
}))
const eligibleSource = {
  inboxId: "i1",
  inboxName: "Shop Inbox",
  channel: "messenger",
  accountId: "page-1",
  sourceName: "Shop Page",
  eligible: true,
  ineligibleReason: null,
}
const absentSource = {
  ...eligibleSource,
  inboxId: "i2",
  inboxName: "Old Inbox",
  accountId: "page-2",
  sourceName: null,
  eligible: false,
  ineligibleReason: "notInAhachat",
}
const ambiguousSource = {
  ...absentSource,
  inboxId: "i3",
  inboxName: "Twin Inbox",
  ineligibleReason: "pageAmbiguous",
}

const idleAvailability = {
  canSync: true,
  blockedReason: null,
  nextSyncAt: null,
  activeRunId: null,
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <ContactSyncDialog onOpenChange={setOpen} open={open} workspaceId="ws-1" />
  )
}

function renderDialog() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<DialogHarness />)
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

const setSources = (...sources: unknown[]) => {
  queryStates.availability = { data: idleAvailability }
  queryStates.sources = { data: { data: sources } }
}

const buttonWithText = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined

const startButton = (el: HTMLElement) => buttonWithText(el, "contactSync.start")

const checkboxFor = (el: HTMLElement, inboxId: string) =>
  el.querySelector(`#contact-sync-source-${inboxId}`) as HTMLInputElement

const switchFor = (el: HTMLElement, key: string) =>
  el.querySelector(`#contact-sync-${key}`) as HTMLInputElement

const toggle = (input: HTMLInputElement) => {
  act(() => {
    input.click()
  })
}

beforeEach(() => {
  queryStates.availability = { data: idleAvailability }
  queryStates.sources = { data: { data: [] } }
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
  actionState.isPending = false
  vi.clearAllMocks()
})

describe("ContactSyncDialog states", () => {
  test("shows a spinner while availability or sources are loading", () => {
    queryStates.availability = { isPending: true }
    queryStates.sources = { isPending: true }

    const el = renderDialog()

    expect(el.querySelector("svg.animate-spin")).not.toBeNull()
    expect(startButton(el)).toBeUndefined()
  })

  test("shows the error with a Retry that refetches the contact sync queries", () => {
    queryStates.availability = { isError: true }
    queryStates.sources = { data: { data: [] } }

    const el = renderDialog()

    expect(el.textContent).toContain("contactSync.errors.generic")
    act(() => {
      buttonWithText(el, "actions.retry")?.click()
    })
    expect(invalidators.contactSyncs).toHaveBeenCalledTimes(1)
  })

  test("with no sources, explains and offers no settings link or form", () => {
    setSources()

    const el = renderDialog()

    expect(el.textContent).toContain("contactSync.empty")
    expect(el.querySelector('a[href*="integrations/ahachat"]')).toBeNull()
    expect(startButton(el)).toBeUndefined()
  })

  test.each([
    ["no source", () => setSources()],
    [
      "the cooldown",
      () => {
        queryStates.availability = {
          data: {
            canSync: false,
            blockedReason: "cooldown",
            nextSyncAt: new Date("2030-05-06T07:08:09.000Z"),
            activeRunId: null,
          },
        }
        queryStates.sources = { data: { data: [eligibleSource] } }
      },
    ],
    ["the form", () => setSources(eligibleSource)],
  ])("links to the sync history with %s", (_label, arrange) => {
    arrange()

    const el = renderDialog()

    const link = el.querySelector(
      'a[href="/space/ws-1/contacts/sync/histories"]',
    )
    expect(link?.textContent).toContain("contactSync.history.open")
  })

  test("following the sync history link closes the dialog at once", () => {
    setSources(eligibleSource)
    const el = renderDialog()
    const dialog = () => el.querySelector('[data-testid="dialog"]')
    act(() => {
      el.querySelector<HTMLElement>('[data-testid="open-dialog"]')?.click()
    })
    expect(dialog()?.getAttribute("data-open")).toBe("true")

    act(() => {
      el.querySelector<HTMLElement>(
        'a[href="/space/ws-1/contacts/sync/histories"]',
      )?.click()
    })

    expect(dialog()?.getAttribute("data-open")).toBe("false")
  })

  test("during the cooldown shows the formatted next sync time instead of the form", () => {
    queryStates.availability = {
      data: {
        canSync: false,
        blockedReason: "cooldown",
        nextSyncAt: new Date("2030-05-06T07:08:09.000Z"),
        activeRunId: null,
      },
    }
    queryStates.sources = { data: { data: [eligibleSource] } }

    const el = renderDialog()

    expect(el.textContent).toContain(
      `contactSync.cooldown:${JSON.stringify({ time: "2030-05-06T07:08:09.000Z" })}`,
    )
    expect(startButton(el)).toBeUndefined()
  })

  test("with an active run shows its progress, not the form", () => {
    queryStates.availability = {
      data: {
        canSync: false,
        blockedReason: "running",
        nextSyncAt: null,
        activeRunId: "run-9",
      },
    }
    queryStates.sources = { data: { data: [eligibleSource] } }

    const el = renderDialog()

    expect(
      el.querySelector('[data-testid="progress"]')?.getAttribute("data-run-id"),
    ).toBe("run-9")
    expect(startButton(el)).toBeUndefined()
  })

  test("Done on a finished run closes the dialog", () => {
    queryStates.availability = {
      data: {
        canSync: false,
        blockedReason: "running",
        nextSyncAt: null,
        activeRunId: "run-9",
      },
    }
    queryStates.sources = { data: { data: [eligibleSource] } }
    const el = renderDialog()
    const dialog = () => el.querySelector('[data-testid="dialog"]')

    act(() => {
      ;(el.querySelector('[data-testid="open-dialog"]') as HTMLElement).click()
    })
    expect(dialog()?.getAttribute("data-open")).toBe("true")
    act(() => {
      ;(el.querySelector('[data-testid="settle"]') as HTMLElement).click()
    })

    expect(dialog()?.getAttribute("data-open")).toBe("false")
  })

  test("settling a run refreshes contacts, tags, custom fields and the sync queries", () => {
    queryStates.availability = {
      data: {
        canSync: false,
        blockedReason: "running",
        nextSyncAt: null,
        activeRunId: "run-9",
      },
    }
    queryStates.sources = { data: { data: [eligibleSource] } }
    const el = renderDialog()

    act(() => {
      ;(el.querySelector('[data-testid="settle"]') as HTMLElement).click()
    })

    expect(invalidators.contacts).toHaveBeenCalledTimes(1)
    expect(invalidators.tags).toHaveBeenCalledTimes(1)
    expect(invalidators.customFields).toHaveBeenCalledTimes(1)
    expect(invalidators.contactSyncs).toHaveBeenCalledTimes(1)
  })
})

describe("ContactSyncDialog form", () => {
  test("lists each inbox with its channel and the AhaChat page it maps to", () => {
    setSources(eligibleSource)

    const el = renderDialog()

    expect(el.textContent).toContain("Shop Inbox")
    expect(el.textContent).toContain(
      `contactSync.source.mapsTo:${JSON.stringify({ channel: "Messenger", page: "Shop Page" })}`,
    )
    expect(checkboxFor(el, "i1").disabled).toBe(false)
  })

  test("lists only the pages AhaChat has a match for", () => {
    setSources(eligibleSource, absentSource, ambiguousSource)

    const el = renderDialog()

    expect(checkboxFor(el, "i1")).not.toBeNull()
    expect(checkboxFor(el, "i2")).toBeNull()
    expect(checkboxFor(el, "i3")).toBeNull()
    expect(el.textContent).not.toContain("contactSync.ineligible.notInAhachat")
  })

  test("when no page has a match, says so instead of showing the form", () => {
    setSources(absentSource, ambiguousSource)

    const el = renderDialog()

    expect(el.textContent).toContain("contactSync.noneInAhachat")
    expect(startButton(el)).toBeUndefined()
  })

  test("an unreachable AhaChat is an error with Retry, not 'no match'", () => {
    setSources({
      ...absentSource,
      ineligibleReason: "ahachatUnavailable",
    })

    const el = renderDialog()

    expect(el.textContent).toContain(
      "contactSync.ineligible.ahachatUnavailable",
    )
    expect(el.textContent).not.toContain("contactSync.noneInAhachat")
    act(() => {
      buttonWithText(el, "actions.retry")?.click()
    })
    expect(invalidators.contactSyncs).toHaveBeenCalledTimes(1)
  })

  test("Start is disabled while nothing is selected", () => {
    setSources(eligibleSource)

    const el = renderDialog()

    expect(startButton(el)?.disabled).toBe(true)
  })

  test("overwrite defaults OFF while tags and custom fields default ON", () => {
    setSources(eligibleSource)

    const el = renderDialog()

    expect(switchFor(el, "syncTags").checked).toBe(true)
    expect(switchFor(el, "syncCustomFields").checked).toBe(true)
    expect(switchFor(el, "overwriteExisting").checked).toBe(false)
  })

  test("the Advanced link shows only with a selected source and tags or fields on", () => {
    setSources(eligibleSource)
    const el = renderDialog()
    const advanced = () => buttonWithText(el, "contactSync.advanced.show")

    expect(advanced()).toBeUndefined()

    toggle(checkboxFor(el, "i1"))
    expect(advanced()).toBeDefined()

    toggle(switchFor(el, "syncTags"))
    expect(advanced()).toBeDefined()

    toggle(switchFor(el, "syncCustomFields"))
    expect(advanced()).toBeUndefined()

    toggle(switchFor(el, "syncTags"))
    expect(advanced()).toBeDefined()

    toggle(checkboxFor(el, "i1"))
    expect(advanced()).toBeUndefined()
  })

  test("Advanced reveals the mapping for each selected source", () => {
    setSources(eligibleSource)
    const el = renderDialog()
    toggle(checkboxFor(el, "i1"))
    expect(el.querySelector('[data-testid="mapping"]')).toBeNull()

    act(() => {
      buttonWithText(el, "contactSync.advanced.show")?.click()
    })

    expect(
      el
        .querySelector('[data-testid="mapping"]')
        ?.getAttribute("data-inbox-id"),
    ).toBe("i1")
    expect(buttonWithText(el, "contactSync.advanced.hide")).toBeDefined()
  })

  test("Start sends the selected inboxes and the options", () => {
    const second = { ...eligibleSource, inboxId: "i4", inboxName: "Second" }
    setSources(eligibleSource, second)
    const el = renderDialog()
    toggle(checkboxFor(el, "i1"))
    toggle(checkboxFor(el, "i4"))
    toggle(switchFor(el, "overwriteExisting"))
    toggle(switchFor(el, "syncCustomFields"))

    act(() => {
      startButton(el)?.click()
    })

    expect(execute).toHaveBeenCalledWith({
      syncTags: true,
      syncCustomFields: false,
      overwriteExisting: true,
      sources: [{ inboxId: "i1" }, { inboxId: "i4" }],
    })
  })

  test("Start is disabled while the action is pending", () => {
    setSources(eligibleSource)
    actionState.isPending = true
    const el = renderDialog()
    toggle(checkboxFor(el, "i1"))

    expect(startButton(el)?.disabled).toBe(true)
  })

  test("a started sync switches to its progress and refreshes the sync queries", () => {
    setSources(eligibleSource)
    const el = renderDialog()

    act(() => {
      actionState.options.onSuccess?.({ data: { runId: "run-new" } })
    })

    expect(
      el.querySelector('[data-testid="progress"]')?.getAttribute("data-run-id"),
    ).toBe("run-new")
    expect(invalidators.contactSyncs).toHaveBeenCalledTimes(1)
  })

  test("a failed start toasts the validation message, else the server error, else a generic one", () => {
    setSources(eligibleSource)
    renderDialog()

    act(() => {
      actionState.options.onError?.({
        error: { validationErrors: { _errors: ["cooldown"] } },
      })
      actionState.options.onError?.({ error: { serverError: "server" } })
      actionState.options.onError?.({ error: {} })
    })

    expect(toast.error).toHaveBeenNthCalledWith(1, "cooldown")
    expect(toast.error).toHaveBeenNthCalledWith(2, "server")
    expect(toast.error).toHaveBeenNthCalledWith(3, "contactSync.errors.generic")
  })
})
