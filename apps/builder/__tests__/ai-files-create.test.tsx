import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "workspace-1" }))
vi.mock("@chatbotx.io/ai", () => ({
  getAllowableKnowledgeExtensions: () => ".pdf,.txt",
}))
vi.mock("../src/features/ai-files/actions/create-ai-file.action", () => ({
  createAIFileAction: { bind: () => vi.fn() },
}))
vi.mock(
  "../src/features/ai-files/actions/create-ai-file-from-url.action",
  () => ({ createAIFileFromUrlAction: { bind: () => vi.fn() } }),
)

const upload = vi.hoisted(() => ({ props: undefined as unknown }))
vi.mock("@chatbotx.io/ui/components/uploader/direct-upload-button", () => ({
  DirectUploadButton: (props: { label: string; maxSize: number }) => {
    upload.props = props
    return (
      <button data-max-size={props.maxSize} type="button">
        {props.label}
      </button>
    )
  },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: toastMocks }))

// Real react-hook-form + resolver; submit records the values and the test
// drives the captured action callbacks.
const adapter = vi.hoisted(() => ({
  submitted: vi.fn(),
  reset: vi.fn(),
  actionProps: undefined as
    | {
        onSuccess: (arg: { data: unknown }) => void
        onError: (arg: { error: { serverError?: string } }) => void
      }
    | undefined,
}))
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    resolver: never,
    options: {
      formProps: { defaultValues: unknown; mode: "onChange" }
      actionProps: typeof adapter.actionProps
    },
  ) => {
    adapter.actionProps = options.actionProps
    const form = useForm({
      resolver,
      mode: options.formProps.mode,
      defaultValues: options.formProps.defaultValues as never,
    })
    return {
      form,
      handleSubmitWithAction: form.handleSubmit((values) =>
        adapter.submitted(values),
      ),
      resetFormAndAction: adapter.reset,
    }
  },
}))

const { AIFilesCreate } = await import(
  "../src/features/ai-files/ai-files-create"
)

const enCreate = messages.aiFiles.create

describe("AIFilesCreate", () => {
  let container: HTMLDivElement
  let root: Root
  const onSuccess = vi.fn()

  const render = () =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <AIFilesCreate onSuccess={onSuccess} />
        </NextIntlClientProvider>,
      )
    })

  const button = (text: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (element) => element.textContent?.trim() === text,
    )

  const openUrlTab = async () => {
    await act(() => {
      button(enCreate.trigger)?.click()
    })
    await act(() => {
      ;(
        Array.from(document.querySelectorAll('[role="tab"]')).find(
          (tab) => tab.textContent === enCreate.tabs.fromUrl,
        ) as HTMLElement | undefined
      )?.click()
    })
  }

  const type = async (name: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(
      `input[name="${name}"]`,
    )
    if (!input) {
      throw new Error(`No input ${name}`)
    }
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
  })

  test("opens a dialog with an upload tab and a URL tab", async () => {
    render()
    await act(() => {
      button(enCreate.trigger)?.click()
    })

    expect(document.body.textContent).toContain(enCreate.title)
    const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map(
      (tab) => tab.textContent,
    )
    expect(tabs).toEqual([messages.actions.uploadFile, enCreate.tabs.fromUrl])
    expect(
      document.querySelector("[data-max-size]")?.getAttribute("data-max-size"),
    ).toBe(String(25 * 1024 * 1024))
  })

  test("submit stays disabled until name and URL are valid", async () => {
    render()
    await openUrlTab()

    expect(document.body.textContent).toContain(enCreate.snapshotNotice)
    const submit = () => button(messages.actions.add) as HTMLButtonElement

    expect(submit().disabled).toBe(true)
    await type("name", "Handbook")
    await type("url", "not a url")
    expect(submit().disabled).toBe(true)
    await type("url", "https://example.com/handbook.pdf")
    expect(submit().disabled).toBe(false)

    await act(() => {
      submit().click()
    })
    expect(adapter.submitted).toHaveBeenCalledWith({
      name: "Handbook",
      url: "https://example.com/handbook.pdf",
    })
  })

  test("a success closes the dialog, resets the form and calls onSuccess", async () => {
    render()
    await openUrlTab()
    expect(
      document.querySelector('[role="dialog"]')?.hasAttribute("data-closed"),
    ).toBe(false)

    await act(() => {
      adapter.actionProps?.onSuccess({ data: { processingRunError: null } })
    })

    expect(adapter.reset).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalled()
    expect(toastMocks.success).toHaveBeenCalled()
    // Base UI keeps the popup mounted through its exit animation.
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog === null || dialog.hasAttribute("data-closed")).toBe(true)
  })

  test("shows the translated server error", async () => {
    render()
    await openUrlTab()

    await act(() => {
      adapter.actionProps?.onError({
        error: { serverError: "This Google file is not shared publicly" },
      })
    })

    expect(toastMocks.error).toHaveBeenCalledWith(
      "This Google file is not shared publicly",
    )
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
