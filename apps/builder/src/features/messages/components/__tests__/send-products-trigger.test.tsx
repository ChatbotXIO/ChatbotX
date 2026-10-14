// @vitest-environment jsdom
import type { SendProductsStepSchema } from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { SendProductsDialogTrigger } from "../send-products-trigger"

type ActionResult = { serverError?: string; validationErrors?: unknown }

const mocks = vi.hoisted(() => ({
  executeAsync: vi.fn(),
  disableBot: vi.fn(),
  toastError: vi.fn(),
  updateConversation: vi.fn(),
  isExecuting: false,
  actionCallbacks: [] as Array<{
    onSuccess?: () => void
    onError?: (props: { error: { serverError?: string } }) => void
  }>,
  conversation: {
    id: "conv-1",
    workspaceId: "ws-1",
    botEnabled: true,
    botResumeAt: null as Date | null,
  },
  dialogProps: null as null | {
    open: boolean
    channel: string
    submitText?: string
    isSubmitting?: boolean
    step: SendProductsStepSchema
    onOpenChange: (open: boolean) => void
    onSave: (values: unknown) => Promise<boolean>
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => "client-id-1",
}))

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeConversationId: mocks.conversation.id,
      conversations: [mocks.conversation],
      updateConversation: mocks.updateConversation,
    }),
}))

// `useAction` is called twice per render: first the bot-pause, then the send.
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    _action: unknown,
    callbacks: (typeof mocks.actionCallbacks)[number],
  ) => {
    mocks.actionCallbacks.push(callbacks)
    return mocks.actionCallbacks.length % 2 === 1
      ? { execute: mocks.disableBot }
      : { executeAsync: mocks.executeAsync, isExecuting: mocks.isExecuting }
  },
}))

vi.mock("@/features/conversations/actions/disable-bot.action", () => ({
  disableBotAction: { bind: () => ({}) },
}))
vi.mock("../../actions/create-message.action", () => ({
  createMessageAction: { bind: () => ({}) },
}))

vi.mock(
  "@/features/flows/react-flow/steps/send-products/components/send-products-dialog",
  () => ({
    SendProductsDialog: (props: NonNullable<typeof mocks.dialogProps>) => {
      mocks.dialogProps = props
      return props.open ? <div data-testid="dialog" /> : null
    },
  }),
)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.actionCallbacks.length = 0
  mocks.dialogProps = null
  mocks.isExecuting = false
  mocks.conversation.botEnabled = true
  mocks.executeAsync.mockResolvedValue({ data: { id: "msg-1" } })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (bypassThreadControlLock?: boolean) =>
  act(() =>
    root.render(
      <SendProductsDialogTrigger
        bypassThreadControlLock={bypassThreadControlLock}
        channel="whatsapp"
        inboxId="inbox-7"
      />,
    ),
  )
const button = () =>
  container.querySelector<HTMLButtonElement>(
    'button[aria-label="flows.actions.sendProducts"]',
  )
const values = {
  display: "products" as const,
  header: "Picks",
  body: "Look",
  footer: "",
  sections: [{ title: "", productIds: ["1", "2"] }],
}
const save = (input: unknown = values) =>
  act(async () => {
    await mocks.dialogProps?.onSave(input)
  })
/** The latest render's callbacks for the send action (second `useAction`). */
const sendCallbacks = () => mocks.actionCallbacks.at(-1) ?? {}
const botCallbacks = () => mocks.actionCallbacks.at(-2) ?? {}

describe("SendProductsDialogTrigger", () => {
  test("opens the dialog for the channel from a button, labelled Send", () => {
    render()
    expect(mocks.dialogProps?.open).toBe(false)

    act(() => button()?.click())

    expect(mocks.dialogProps).toMatchObject({
      open: true,
      channel: "whatsapp",
      submitText: "actions.send",
    })
    expect(mocks.dialogProps?.step.sections).toEqual([{ productIds: [] }])
  })

  test("sends the message through the inbox send, on the inbox it was gated on", async () => {
    render(true)
    act(() => button()?.click())

    await save()

    expect(mocks.executeAsync).toHaveBeenCalledWith({
      products: {
        display: "products",
        header: "Picks",
        body: "Look",
        footer: undefined,
        sections: [{ title: undefined, productIds: ["1", "2"] }],
      },
      inboxId: "inbox-7",
      clientId: "client-id-1",
      bypassThreadControlLock: true,
    })
  })

  test("lets the dialog close on success, and pauses the bot like any other agent reply", async () => {
    render()
    act(() => button()?.click())

    let keepOpen: boolean | undefined
    await act(async () => {
      keepOpen = await mocks.dialogProps?.onSave(values)
    })
    act(() => sendCallbacks().onSuccess?.())

    expect(keepOpen).toBe(true)
    expect(mocks.disableBot).toHaveBeenCalledWith({ ids: ["conv-1"] })
  })

  test("leaves the bot alone when it is already paused", () => {
    mocks.conversation.botEnabled = false
    mocks.conversation.botResumeAt = new Date(Date.now() + 60_000)
    render()

    act(() => sendCallbacks().onSuccess?.())

    expect(mocks.disableBot).not.toHaveBeenCalled()
  })

  test("pausing the bot updates the conversation in the store", () => {
    render()

    act(() => botCallbacks().onSuccess?.())

    expect(mocks.updateConversation).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ botEnabled: false }),
    )
  })

  test.each([
    ["a server refusal", { serverError: "Products not sendable" }],
    ["a validation error", { validationErrors: { products: {} } }],
  ] as const)("keeps the dialog open after %s, so the message can be fixed", async (_name, result: ActionResult) => {
    mocks.executeAsync.mockResolvedValue(result)
    render()
    act(() => button()?.click())

    let keepOpen = true
    await act(async () => {
      keepOpen = (await mocks.dialogProps?.onSave(values)) as boolean
    })

    expect(keepOpen).toBe(false)
  })

  test("keeps the dialog open, without an unhandled rejection, when the request itself fails", async () => {
    mocks.executeAsync.mockRejectedValue(new Error("Failed to fetch"))
    render()
    act(() => button()?.click())

    let keepOpen: boolean | undefined
    await act(async () => {
      keepOpen = await mocks.dialogProps?.onSave(values)
    })

    expect(keepOpen).toBe(false)
  })

  test("a refusal toasts a translated title with the server's detail", () => {
    render()

    act(() => sendCallbacks().onError?.({ error: { serverError: "Nope" } }))

    expect(mocks.toastError).toHaveBeenCalledWith(
      "flows.sendProducts.sendFailed",
      { description: "Nope" },
    )
  })

  test("disables the dialog's submit while sending", () => {
    mocks.isExecuting = true
    render()

    expect(mocks.dialogProps?.isSubmitting).toBe(true)
  })
})
