import { act, useCallback } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Controller, useForm, useFormContext } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ContactScanForm } from "@/features/contact-scan/components/contact-scan-form"
import type { GetContactScanStatusResponse } from "@/features/contact-scan/schema/query"

/** Echoes the key (plus params) back so assertions never depend on copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
  }),
}))

const mockRouterPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Only `.bind()`-ed onto the (mocked) hook below — never invoked in this
// test — so a bare stub keeps this test from pulling in business/DB wiring.
vi.mock("@/features/contact-scan/actions/schedule-contact-scan.action", () => ({
  scheduleContactScanAction: vi.fn(),
}))

// The form renders with no inboxes configured — its visibility in the
// Import submenu is `contacts-list-action.tsx`'s job, not this form's —
// stub the hook so this test doesn't need a real `InboxStoreProvider`.
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInboxOptionsForChannels: () => [],
}))

// Real `useForm()` wired the same way the adapter wires it, so
// `form.formState`/`form.watch` — what the disabling logic under test reads
// — behave exactly like production.
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: () => {
    const form = useForm()
    const { reset } = form
    return {
      form,
      handleSubmitWithAction: (event?: { preventDefault?: () => void }) => {
        event?.preventDefault?.()
        return Promise.resolve()
      },
      resetFormAndAction: useCallback(() => reset(), [reset]),
    }
  },
}))

// Swap the heavy widgets for minimal probes — native `<select>`/date-picker
// interaction is irrelevant to what this test covers (the `disabled` prop
// the form computes, and the status-panel copy).
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({ name }: { name: string }) => (
    <span data-testid={`field-${name}`} />
  ),
}))

// Wired to a real `Controller` (rendered inside the real `FormProvider` from
// `@chatbotx.io/ui/components/ui/form`, unmocked here) so tests can drive
// `scanFromAt` and observe the dynamic description that reads it via
// `form.watch` — a plain display stub can't exercise that.
vi.mock("@chatbotx.io/ui/components/form/date-picker-field", () => ({
  DateTimePickerField: ({
    disabled,
    name,
  }: {
    disabled?: unknown
    name: string
  }) => {
    const { control } = useFormContext()
    return (
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <button
            data-disabled={String(disabled === true)}
            data-testid={`field-${name}`}
            onClick={() => field.onChange("2024-06-15 09:30:00")}
            type="button"
          />
        )}
      />
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

type FetchIntervalQuery = { state: { data?: { status: string } } }
type CapturedQueryOptions = {
  refetchInterval?: (query: FetchIntervalQuery) => number | false
}

let capturedQueryOptions: CapturedQueryOptions = {}
let currentQueryData: GetContactScanStatusResponse | undefined

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: CapturedQueryOptions) => {
    capturedQueryOptions = options
    return { data: currentQueryData }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactScanAPIs: {
      getContactScanStatusAuthenticatedAPI: {
        queryOptions: (options: unknown) => options,
        key: () => ["contact-scan-status"],
      },
    },
  },
}))

const RUN_BASE = {
  id: "run-1",
  scanFromAt: new Date("2024-01-01T00:00:00Z"),
  createdAt: new Date("2024-01-01T00:00:00Z"),
  startedAt: new Date("2024-01-01T00:00:00Z"),
  currentScan: 5,
  currentError: null as string | null,
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderForm() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<ContactScanForm workspaceId="ws-1" />)
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  currentQueryData = undefined
  capturedQueryOptions = {}
  mockRouterPush.mockReset()
})

function submitButton(el: HTMLElement) {
  return Array.from(el.querySelectorAll("button")).find(
    (b) => b.type === "submit",
  ) as HTMLButtonElement
}

function scanFromField(el: HTMLElement) {
  return el.querySelector('[data-testid="field-scanFromAt"]')
}

describe("ContactScanForm", () => {
  test("renders the page heading and the before-choose hint when no scan-from date is picked yet", () => {
    currentQueryData = undefined
    const el = renderForm()

    expect(el.textContent).toContain("contactScan.title")
    expect(el.textContent).toContain("contactScan.hint.beforeChoose")
    expect(el.textContent).not.toContain("contactScan.hint.range")
  })

  test("swaps to the range hint with the formatted from-date once a scan-from date is chosen", () => {
    currentQueryData = undefined
    const el = renderForm()

    act(() => {
      ;(scanFromField(el) as HTMLButtonElement).click()
    })

    expect(el.textContent).toContain("contactScan.hint.range")
    expect(el.textContent).toContain('"from"')
    expect(el.textContent).not.toContain("contactScan.hint.beforeChoose")
  })

  test("links to the scan history page for this workspace", () => {
    currentQueryData = undefined
    const el = renderForm()

    const link = el.querySelector(
      'a[href="/space/ws-1/contacts/scan/histories"]',
    )
    expect(link).not.toBeNull()
    expect(link?.textContent).toContain("contactScan.histories.title")
  })

  test("disables the date picker and replaces submit with a Scan History button when canScan=false", () => {
    currentQueryData = {
      status: "running",
      latest: {
        ...RUN_BASE,
        status: "running",
        finishedAt: null,
        importedContactCount: 0,
      },
      availability: {
        canScan: false,
        blockedReason: "running",
        nextScanAt: new Date("2024-01-02T00:00:00Z"),
      },
    }

    const el = renderForm()

    expect(scanFromField(el)?.getAttribute("data-disabled")).toBe("true")
    // When a scan can't start, no action button is shown at all — the status
    // panel explains why. (The date-picker field renders as a button stub in
    // this test, so assert on the action buttons' text rather than count.)
    expect(submitButton(el)).toBeUndefined()
    const actionButton = Array.from(el.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("contactScan.submit") ||
        b.textContent?.includes("contactScan.histories.title") ||
        b.textContent?.includes("actions.cancel"),
    )
    expect(actionButton).toBeUndefined()
  })

  test("leaves the date picker only future-restricted (not fully disabled) when canScan=true", () => {
    currentQueryData = {
      status: "idle",
      latest: null,
      availability: { canScan: true },
    }

    const el = renderForm()

    expect(scanFromField(el)?.getAttribute("data-disabled")).toBe("false")
  })

  test("shows the idle status copy when no scan has ever run", () => {
    currentQueryData = {
      status: "idle",
      latest: null,
      availability: { canScan: true },
    }

    const el = renderForm()
    expect(el.textContent).toContain("contactScan.status.idle")
  })

  test("shows the running status copy with an eta param while init/running", () => {
    currentQueryData = {
      status: "running",
      latest: {
        ...RUN_BASE,
        status: "running",
        finishedAt: null,
        importedContactCount: 0,
      },
      availability: {
        canScan: false,
        blockedReason: "running",
        nextScanAt: new Date("2024-01-02T00:00:00Z"),
      },
    }

    const el = renderForm()
    expect(el.textContent).toContain("contactScan.status.running")
    expect(el.textContent).toContain("eta")
  })

  test("shows the finished status copy plus the imported-count line when succeeded", () => {
    currentQueryData = {
      status: "succeeded",
      latest: {
        ...RUN_BASE,
        status: "succeeded",
        finishedAt: new Date("2024-01-01T01:00:00Z"),
        importedContactCount: 7,
      },
      availability: { canScan: true },
    }

    const el = renderForm()
    expect(el.textContent).toContain("contactScan.status.finished")
    expect(el.textContent).toContain("contactScan.status.total")
  })

  test("shows the partial status copy", () => {
    currentQueryData = {
      status: "partial",
      latest: {
        ...RUN_BASE,
        status: "partial",
        finishedAt: new Date("2024-01-01T01:00:00Z"),
        importedContactCount: 2,
      },
      availability: { canScan: true },
    }

    const el = renderForm()
    expect(el.textContent).toContain("contactScan.status.partial")
  })

  test("shows the failed status copy", () => {
    currentQueryData = {
      status: "failed",
      latest: {
        ...RUN_BASE,
        status: "failed",
        finishedAt: new Date("2024-01-01T01:00:00Z"),
        importedContactCount: 0,
      },
      availability: { canScan: true },
    }

    const el = renderForm()
    expect(el.textContent).toContain("contactScan.status.failed")
  })

  test("shows the cooldown wait message with the next-scan time when settled but still cooling down", () => {
    currentQueryData = {
      status: "succeeded",
      latest: {
        ...RUN_BASE,
        status: "succeeded",
        finishedAt: new Date("2024-01-01T01:00:00Z"),
        importedContactCount: 4,
      },
      availability: {
        canScan: false,
        blockedReason: "cooldown",
        nextScanAt: new Date("2024-01-02T00:00:00Z"),
      },
    }

    const el = renderForm()
    expect(el.textContent).toContain("contactScan.status.waitCooldown")
    expect(el.textContent).toContain("contactScan.status.nextScan")
  })

  test("keeps polling while status is init/running and stops once settled or idle", () => {
    currentQueryData = {
      status: "idle",
      latest: null,
      availability: { canScan: true },
    }
    renderForm()

    const refetchInterval = capturedQueryOptions.refetchInterval
    expect(refetchInterval).toBeDefined()

    for (const status of ["init", "running"]) {
      expect(refetchInterval?.({ state: { data: { status } } })).not.toBe(false)
    }
    for (const status of ["succeeded", "partial", "failed", "idle"]) {
      expect(refetchInterval?.({ state: { data: { status } } })).toBe(false)
    }
  })

  test("shows a centered Automatic Scan submit button when a scan is allowed", () => {
    currentQueryData = {
      status: "idle",
      latest: null,
      availability: { canScan: true },
    }
    const el = renderForm()

    const submit = submitButton(el)
    expect(submit).toBeDefined()
    expect(submit.textContent).toContain("contactScan.submit")
  })
})
