// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const slaEnabled = vi.hoisted(() => ({ value: true }))
vi.mock("@/features/response-sla/provider/response-sla-hook", () => ({
  useResponseSlaEnabled: () => slaEnabled.value,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { time?: string }) =>
    values?.time ? `${key}:${values.time}` : key,
  useFormatter: () => ({ relativeTime: () => "in 5 minutes" }),
}))

const { SlaPill } = await import("@/features/conversations/components/sla-pill")

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  slaEnabled.value = true
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const minutesFromNow = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000)
const render = (due: Date | null, breaching: Date | null) =>
  act(() =>
    root.render(
      <SlaPill responseDueAt={due} responseSlaBreachingAt={breaching} />,
    ),
  )

describe("SlaPill", () => {
  test("renders nothing when no SLA applies", () => {
    render(null, null)
    expect(container.textContent).toBe("")
  })

  test("stays quiet while there is plenty of time", () => {
    render(minutesFromNow(60), minutesFromNow(45))
    expect(container.textContent).toBe("")
  })

  test("shows the time left once inside the breaching threshold", () => {
    render(minutesFromNow(5), minutesFromNow(-10))
    expect(container.textContent).toBe("responseSla.due:in 5 minutes")
    expect(container.querySelector("[data-sla-state=breaching]")).not.toBeNull()
  })

  test("shows Overdue past the deadline", () => {
    render(minutesFromNow(-1), minutesFromNow(-30))
    expect(container.textContent).toBe("responseSla.overdue")
    expect(container.querySelector("[data-sla-state=overdue]")).not.toBeNull()
  })

  test("renders nothing while the SLA is switched off", () => {
    slaEnabled.value = false
    render(minutesFromNow(-1), minutesFromNow(-30))
    expect(container.textContent).toBe("")
  })
})
