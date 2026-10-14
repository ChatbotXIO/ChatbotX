// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { InputMenu } from "../input-menu"

const chatState = vi.hoisted(() => ({ activePost: null as unknown }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof chatState) => unknown) =>
    selector(chatState),
}))

vi.mock("@/features/flows/components/select-flow-dialog", () => ({
  SelectFlowDialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="flow-dialog">{children}</div>
  ),
}))
vi.mock("@/features/saved-replies/saved-reply-manage", () => ({
  default: () => null,
}))
vi.mock("../emoji-picker", () => ({ default: () => null }))
vi.mock("../send-products-trigger", () => ({
  SendProductsDialogTrigger: (props: {
    channel: string
    inboxId: string
    bypassThreadControlLock?: boolean
  }) => (
    <button
      data-bypass={String(props.bypassThreadControlLock)}
      data-channel={props.channel}
      data-inbox={props.inboxId}
      data-testid="send-products"
      type="button"
    />
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  chatState.activePost = null
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (props: Parameters<typeof InputMenu>[0]) =>
  act(() => root.render(<InputMenu {...props} />))
const sendProducts = () =>
  container.querySelector<HTMLElement>('[data-testid="send-products"]')

describe("InputMenu — send products", () => {
  test("is offered on a channel whose policy has product messages, for the inbox it sends through", () => {
    render({
      setContent: vi.fn(),
      contactInbox: { channel: "whatsapp", inboxId: "inbox-7" },
      bypassThreadControlLock: true,
    })

    expect(sendProducts()?.dataset).toMatchObject({
      channel: "whatsapp",
      inbox: "inbox-7",
      bypass: "true",
    })
  })

  test.each([
    "messenger",
    "instagram",
    "telegram",
    "omnichannel",
    "not-a-channel",
  ])("is not offered on %s", (channel) => {
    render({
      setContent: vi.fn(),
      contactInbox: { channel, inboxId: "inbox-1" },
    })

    expect(sendProducts()).toBeNull()
  })

  test("is not offered before the conversation's inbox is known", () => {
    render({ setContent: vi.fn() })

    expect(sendProducts()).toBeNull()
  })

  test("is not offered while replying to a post comment, like the flow button", () => {
    chatState.activePost = { id: "post-1" }
    render({
      setContent: vi.fn(),
      contactInbox: { channel: "whatsapp", inboxId: "inbox-1" },
    })

    expect(sendProducts()).toBeNull()
    expect(container.querySelector('[data-testid="flow-dialog"]')).toBeNull()
  })

  test("keeps the flow button next to it", () => {
    render({
      setContent: vi.fn(),
      contactInbox: { channel: "whatsapp", inboxId: "inbox-1" },
    })

    expect(
      container.querySelector('[data-testid="flow-dialog"]'),
    ).not.toBeNull()
  })
})
