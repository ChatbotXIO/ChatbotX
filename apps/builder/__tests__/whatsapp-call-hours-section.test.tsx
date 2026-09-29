import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WhatsappCallHoursSection } from "@/features/integration-whatsapp/calling/whatsapp-call-hours-section"

/** Echoes the key (and any `day` param) so assertions never depend on copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: { day?: string }) =>
    params?.day ? `${key}(${params.day})` : key,
}))

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/update-call-hours.action",
  () => ({ updateWhatsappCallHoursAction: { bind: () => vi.fn() } }),
)

// Real react-hook-form + the real zod resolver; only the server round-trip is
// replaced, so validation and the submitted payload are the component's own.
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", async () => {
  const { useForm } = await import("react-hook-form")
  return {
    useHookFormAction: (
      _action: unknown,
      resolver: never,
      options: { formProps: Record<string, unknown> },
    ) => {
      const form = useForm({ resolver, ...options.formProps })
      return {
        form,
        action: { isPending: false },
        handleSubmitWithAction: form.handleSubmit((values) =>
          executeMock(values),
        ),
      }
    },
  }
})

Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {}
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

const WEEKDAY_OPEN = {
  status: "ENABLED" as const,
  timezone_id: "Asia/Ho_Chi_Minh",
  weekly_operating_hours: (
    ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const
  ).map((day_of_week) => ({
    day_of_week,
    open_time: "0900",
    close_time: "1700",
  })),
}

describe("WhatsappCallHoursSection", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    props: Partial<Parameters<typeof WhatsappCallHoursSection>[0]> = {},
  ) =>
    act(() => {
      root.render(
        <WhatsappCallHoursSection
          callHours={undefined}
          disabled={false}
          integrationWhatsappId="integration-1"
          workspaceId="workspace-1"
          workspaceTimezone="Asia/Ho_Chi_Minh"
          {...props}
        />,
      )
    })

  /** Runs `fn` inside act and lets the async zod resolver settle afterwards. */
  const actAndSettle = (fn: () => void) =>
    act(() => {
      fn()
      return Promise.resolve()
    })

  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)

  const submit = async () => {
    await actAndSettle(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        )
    })
  }

  test("a number without call hours shows them off, with no schedule and nothing to save", async () => {
    await render()

    const toggle = container.querySelector('[role="switch"]')
    expect(toggle?.getAttribute("aria-checked")).toBe("false")
    expect(container.querySelectorAll("li")).toHaveLength(0)
    expect(container.querySelector('button[type="submit"]')).toBeNull()
  })

  test("switching call hours on reveals the default weekday schedule and a save button", async () => {
    await render()

    await actAndSettle(() => {
      container.querySelector<HTMLButtonElement>('[role="switch"]')?.click()
    })

    const days = container.querySelectorAll("li")
    expect(days).toHaveLength(7)
    expect(days[5].textContent).toContain("whatsapp.calls.hours.closed")
    expect(container.querySelector('button[type="submit"]')).not.toBeNull()
  })

  test("saves the whole schedule after a range is removed", async () => {
    await render({ callHours: WEEKDAY_OPEN })

    await actAndSettle(() => {
      button(
        "whatsapp.calls.hours.removeRangeLabel(whatsapp.calls.hours.days.friday)",
      )?.click()
    })
    await submit()

    expect(executeMock).toHaveBeenCalledTimes(1)
    const values = executeMock.mock.calls[0][0]
    expect(values.enabled).toBe(true)
    expect(values.timezoneId).toBe("Asia/Ho_Chi_Minh")
    expect(values.days[4]).toEqual({ dayOfWeek: "FRIDAY", ranges: [] })
    expect(values.days[0].ranges).toEqual([
      { openMinute: 540, closeMinute: 1020 },
    ])
  })

  test("a second range on a day starts after the first, so it saves without an overlap", async () => {
    await render({ callHours: WEEKDAY_OPEN })

    await actAndSettle(() => {
      button(
        "whatsapp.calls.hours.addRangeLabel(whatsapp.calls.hours.days.monday)",
      )?.click()
    })
    await submit()

    expect(executeMock.mock.calls[0][0].days[0].ranges).toEqual([
      { openMinute: 540, closeMinute: 1020 },
      { openMinute: 1080, closeMinute: 1140 },
    ])
  })

  test("refuses to save a week with no open hours, and says why", async () => {
    await render({ callHours: WEEKDAY_OPEN })

    for (const day of [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]) {
      await actAndSettle(() => {
        button(
          `whatsapp.calls.hours.removeRangeLabel(whatsapp.calls.hours.days.${day})`,
        )?.click()
      })
    }
    await submit()

    expect(executeMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain(
      "whatsapp.calls.hours.errors.noOpenHours",
    )
  })

  test("is read-only while calling itself is off", async () => {
    await render({ callHours: WEEKDAY_OPEN, disabled: true })

    expect(container.querySelector("fieldset")?.disabled).toBe(true)
  })
})
