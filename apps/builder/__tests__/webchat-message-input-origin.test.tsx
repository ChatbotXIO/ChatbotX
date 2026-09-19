// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  submittedInputs: [] as Array<Record<string, unknown>>,
  actionOptions: null as {
    onExecute: (args: { input: Record<string, unknown> }) => void
    onSuccess: (args: { data: null }) => void
  } | null,
  currentFormValues: null as Record<string, unknown> | null,
  submit: null as (() => Promise<void>) | null,
  clientEmbeddingOrigin: "https://www.example.com" as string | null,
}))

vi.mock("@/features/messages/actions/create-webchat-message.action", () => ({
  createWebchatMessageAction: {},
}))

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: vi.fn((_action, _resolver, options) => {
    mocks.actionOptions = options.actionProps
    if (!mocks.currentFormValues) {
      mocks.currentFormValues = { ...options.formProps.defaultValues }
    }

    const form = {
      control: {},
      formState: { isValid: true, isSubmitting: false },
      setValue: vi.fn(),
      reset: vi.fn((values: Record<string, unknown>) => {
        mocks.currentFormValues = { ...values }
      }),
    }

    const submit = async () => {
      const input = { ...mocks.currentFormValues, text: "hello" }
      mocks.submittedInputs.push(input)
      mocks.actionOptions?.onExecute({ input })
      mocks.actionOptions?.onSuccess({ data: null })
    }
    mocks.submit = submit

    return { form, handleSubmitWithAction: submit, resetFormAndAction: vi.fn() }
  }),
}))

vi.mock("@/features/integration-webchat/lib/authorized-domain", () => ({
  getClientEmbeddingOrigin: () => mocks.clientEmbeddingOrigin,
}))
vi.mock("@/features/integration-webchat/providers/store/guest-session-provider", () => ({
  useGuestSessionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ appendMessage: vi.fn(), guestConversationId: "guest-1", sendMessage: vi.fn() }),
}))
vi.mock("@chatbotx.io/ui/components/ui/form", () => ({ Form: ({ children }: { children: ReactNode }) => children }))
vi.mock("@chatbotx.io/ui/components/ui/textarea", () => ({ Textarea: (props: Record<string, unknown>) => <textarea {...props} /> }))
vi.mock("@chatbotx.io/ui/components/ui/button", () => ({ Button: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children as ReactNode}</button> }))
vi.mock("react-hook-form", () => ({
  Controller: ({ render }: { render: (args: { field: Record<string, unknown> }) => ReactNode }) => render({ field: { value: "", onChange: vi.fn() } }),
  useWatch: ({ name }: { name: string }) => (name === "files" ? [] : ""),
}))
vi.mock("../src/features/messages/components/emoji-picker", () => ({ default: () => null }))
vi.mock("../src/features/messages/components/file-upload", () => ({ FileUploadPreview: () => null }))
vi.mock("../src/features/integration-webchat/components/webchat-message-menu", () => ({ default: () => null }))
vi.mock("../src/features/integration-webchat/browser-profile-fields", () => ({ getWebchatProfileFields: () => ({}) }))

import { WebchatMessageInput } from "../src/features/integration-webchat/webchat-message-input"

describe("WebchatMessageInput embedding origin", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.submittedInputs = []
    mocks.actionOptions = null
    mocks.currentFormValues = null
    mocks.submit = null
    mocks.clientEmbeddingOrigin = "https://www.example.com"
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("keeps normal origin stable across prop changes and reset", async () => {
    const props = { workspaceId: "workspace-1", webchatId: "webchat-1", accessToken: "token", parentOrigin: "https://www.example.com" }
    await act(async () => root.render(<WebchatMessageInput {...props} />))
    await act(async () => root.render(<WebchatMessageInput {...props} parentOrigin="https://chat.example.com/webchat?..." />))
    await act(async () => mocks.submit?.())
    await act(async () => mocks.submit?.())
    expect(mocks.submittedInputs.map((input) => input.parentOrigin)).toEqual(["https://www.example.com", "https://www.example.com"])
  })

  test("keeps null origin when client resolver returns an origin", async () => {
    await act(async () => root.render(<WebchatMessageInput workspaceId="workspace-1" webchatId="webchat-1" parentOrigin={null} />))
    await act(async () => mocks.submit?.())
    expect(mocks.submittedInputs[0]?.parentOrigin).toBeUndefined()
  })
})
