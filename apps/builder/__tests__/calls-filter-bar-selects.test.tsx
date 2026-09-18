// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CallsFilterBar } from "@/features/whatsapp-calls/calls-filter-bar"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Mirrors `ads-account-filter.test.tsx` — the base-ui `Select` primitive
// needs real DOM/portal wiring the test doesn't care about; a thin stub lets
// us assert on the value/options/callback contract instead.
vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
    items,
  }: {
    children: ReactNode
    value: string
    onValueChange: (value: string) => void
    items: { label: string; value: string }[]
  }) => (
    <select
      data-value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: () => null,
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}))

const inboxOptions = [
  { id: "inbox-1", name: "Support" },
  { id: "inbox-2", name: "Sales" },
]
const agentOptions = [
  { id: "agent-1", name: "Alice" },
  { id: "agent-2", name: "Bob" },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const baseProps = {
  activity: undefined,
  onActivityChange: vi.fn(),
  inboxId: undefined,
  onInboxChange: vi.fn(),
  inboxOptions,
  agentUserId: undefined,
  onAgentChange: vi.fn(),
  agentOptions,
}

describe("CallsFilterBar — inbox and agent selects", () => {
  test("renders the inbox select with an 'all inboxes' option plus every inbox", () => {
    act(() => {
      root.render(<CallsFilterBar {...baseProps} showAgentFilter={false} />)
    })

    expect(container.textContent).toContain("allInboxes")
    expect(container.textContent).toContain("Support")
    expect(container.textContent).toContain("Sales")
  })

  test("hides the agent select for a non-admin (showAgentFilter=false)", () => {
    act(() => {
      root.render(<CallsFilterBar {...baseProps} showAgentFilter={false} />)
    })

    expect(container.textContent).not.toContain("Alice")
    expect(container.textContent).not.toContain("allAgents")
  })

  test("shows the agent select for an admin (showAgentFilter=true)", () => {
    act(() => {
      root.render(<CallsFilterBar {...baseProps} showAgentFilter={true} />)
    })

    expect(container.textContent).toContain("allAgents")
    expect(container.textContent).toContain("Alice")
    expect(container.textContent).toContain("Bob")
  })

  test("selecting an inbox calls onInboxChange with the inbox id", () => {
    const onInboxChange = vi.fn()
    act(() => {
      root.render(
        <CallsFilterBar
          {...baseProps}
          onInboxChange={onInboxChange}
          showAgentFilter={false}
        />,
      )
    })

    const selects = container.querySelectorAll("select")
    act(() => {
      selects[0].value = "inbox-2"
      selects[0].dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(onInboxChange).toHaveBeenCalledWith("inbox-2")
  })

  test("selecting the 'all inboxes' sentinel calls onInboxChange with undefined", () => {
    const onInboxChange = vi.fn()
    act(() => {
      root.render(
        <CallsFilterBar
          {...baseProps}
          inboxId="inbox-1"
          onInboxChange={onInboxChange}
          showAgentFilter={false}
        />,
      )
    })

    const selects = container.querySelectorAll("select")
    act(() => {
      selects[0].value = ""
      selects[0].dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(onInboxChange).toHaveBeenCalledWith(undefined)
  })

  // An `inboxId` matching no known option (e.g. a stale/foreign id) must
  // fall back to the "all inboxes" sentinel instead of a blank trigger.
  test("falls back to the 'all inboxes' value when inboxId matches no known option", () => {
    act(() => {
      root.render(
        <CallsFilterBar
          {...baseProps}
          inboxId="inbox-does-not-exist"
          showAgentFilter={false}
        />,
      )
    })

    const selects = container.querySelectorAll("select")
    expect(selects[0].getAttribute("data-value")).toBe("")
  })

  test("selecting an agent calls onAgentChange with the agent id", () => {
    const onAgentChange = vi.fn()
    act(() => {
      root.render(
        <CallsFilterBar
          {...baseProps}
          onAgentChange={onAgentChange}
          showAgentFilter={true}
        />,
      )
    })

    const selects = container.querySelectorAll("select")
    const agentSelect = selects[1]
    act(() => {
      agentSelect.value = "agent-2"
      agentSelect.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(onAgentChange).toHaveBeenCalledWith("agent-2")
  })
})
