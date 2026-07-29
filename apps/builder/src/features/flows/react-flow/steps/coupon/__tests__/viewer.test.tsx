// @vitest-environment jsdom

import { type CouponStepSchema, stepTypes } from "@chatbotx.io/flow-config"
import {
  act,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CouponActionViewer } from "../viewer"

const useCouponTopicOptionsMock = vi.fn()

vi.mock("@/features/coupons/provider/use-coupon-topic-options", () => ({
  useCouponTopicOptions: () => useCouponTopicOptionsMock(),
}))

vi.mock("@chatbotx.io/ui/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("../base/viewer", () => ({
  BaseStepViewer: ({
    title,
    icon: Icon,
  }: {
    title: string
    icon: ComponentType
  }) => (
    <div data-testid="base-step-viewer">
      <Icon />
      <span>{title}</span>
    </div>
  ),
}))

vi.mock("lucide-react", () => ({
  TicketPercentIcon: () => null,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "actions.pleaseSelect": "actions.pleaseSelect",
      "coupons.fields.topic": "coupons.fields.topic",
      "coupons.tabs.topicCoupon": "coupons.tabs.topicCoupon",
      "fields.type.label": "fields.type.label",
      "flows.actions.markCouponUsed": "flows.actions.markCouponUsed",
      "flows.actions.setUpCoupon": "flows.actions.setUpCoupon",
    })[key] ?? key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  useCouponTopicOptionsMock.mockReset()
  useCouponTopicOptionsMock.mockReturnValue({
    labelById: new Map([["topic-1", "Resolved topic"]]),
    options: [],
    topics: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const render = (ui: ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

describe("CouponActionViewer", () => {
  test("renders the generic title, type, and resolved topic label", () => {
    const data = {
      id: "step-1",
      stepType: stepTypes.enum.setUpCoupon,
      topicId: "topic-1",
    } satisfies CouponStepSchema

    render(<CouponActionViewer data={data} />)

    expect(container.textContent).toContain("coupons.tabs.topicCoupon")
    expect(container.textContent).toContain("fields.type.label")
    expect(container.textContent).toContain("flows.actions.setUpCoupon")
    expect(container.textContent).toContain("coupons.fields.topic")
    expect(container.textContent).toContain("Resolved topic")
  })

  test("falls back to the raw topic id when the label is missing", () => {
    useCouponTopicOptionsMock.mockReturnValueOnce({
      labelById: new Map(),
      options: [],
      topics: [],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    const data = {
      id: "step-2",
      stepType: stepTypes.enum.markCouponUsed,
      topicId: "topic-missing",
    } satisfies CouponStepSchema

    render(<CouponActionViewer data={data} />)

    expect(container.textContent).toContain("flows.actions.markCouponUsed")
    expect(container.textContent).toContain("topic-missing")
  })
})
