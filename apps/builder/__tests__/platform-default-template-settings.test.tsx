// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { type UseFormProps, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"
import type { UpdateDefaultTemplateSchema } from "../src/features/platform-default-template/schema"

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMocks }))

const actions = vi.hoisted(() => ({
  save: vi.fn(),
  saveRoot: vi.fn(),
  clear: vi.fn(),
  clearRoot: vi.fn(),
  executeClear: vi.fn(),
  clearCallbacks: undefined as { onSuccess: () => void } | undefined,
}))
vi.mock(
  "../src/features/platform-default-template/update-default-template.action",
  () => ({
    updateDefaultTemplateAction: actions.save,
    updateRootDefaultTemplateAction: actions.saveRoot,
    clearDefaultTemplateAction: actions.clear,
    clearRootDefaultTemplateAction: actions.clearRoot,
  }),
)
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, callbacks: { onSuccess: () => void }) => {
    actions.clearCallbacks = callbacks
    return { execute: actions.executeClear, isPending: false }
  },
}))

// A real react-hook-form instance with the real resolver; submit hands the
// parsed values to a stand-in action whose outcome the test controls.
const adapter = vi.hoisted(() => ({
  usedAction: undefined as unknown,
  outcome: { status: "saved" } as unknown,
}))
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    action: unknown,
    resolver: UseFormProps<UpdateDefaultTemplateSchema>["resolver"],
    options: {
      formProps: UseFormProps<UpdateDefaultTemplateSchema>
      actionProps: { onSuccess: (arg: { data: unknown }) => void }
    },
  ) => {
    adapter.usedAction = action
    const form = useForm<UpdateDefaultTemplateSchema>({
      resolver,
      defaultValues: options.formProps.defaultValues,
    })
    return {
      form,
      handleSubmitWithAction: form.handleSubmit(() =>
        options.actionProps.onSuccess({ data: adapter.outcome }),
      ),
    }
  },
}))

const { DefaultTemplateSettings } = await import(
  "../src/features/platform-default-template/default-template-settings"
)

describe("DefaultTemplateSettings", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (
    props: Partial<Parameters<typeof DefaultTemplateSettings>[0]> = {},
  ) =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <DefaultTemplateSettings scope="tenant" settings={null} {...props} />
        </NextIntlClientProvider>,
      )
    })

  const field = (name: string) =>
    container.querySelector<HTMLInputElement>(`input[name='${name}']`)
  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    )
  const eye = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  const type = (input: HTMLInputElement | null, value: string) =>
    act(() => {
      if (!input) {
        throw new Error("missing input")
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  const submit = async () => {
    await act(async () => {
      button("Save")?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    adapter.outcome = { status: "saved" }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("empty: shows 'Not set', no Clear button, and a key field that starts empty", () => {
    render()

    expect(container.textContent).toContain("Not set")
    expect(button("Clear")).toBeUndefined()
    expect(field("templateKey")?.value).toBe("")
    expect(field("templateKey")?.type).toBe("password")
  })

  test.each([
    ["ready", "Active"],
    ["templateUnavailable", "Template unavailable"],
    ["shareDisabled", "Share link off"],
    ["keyRotated", "Key invalid"],
  ] as const)("configured with status %s: shows the badge, the id, and Clear", (status, label) => {
    render({ settings: { templateId: "55", status, templateKey: "saved-key" } })

    expect(container.textContent).toContain(label)
    expect(field("templateId")?.value).toBe("55")
    expect(field("templateKey")?.value).toBe("saved-key")
    expect(button("Clear")).toBeDefined()
  })

  test("blocks an invalid submit instead of calling the action", async () => {
    render()
    type(field("templateId"), "not-a-number")
    type(field("templateKey"), "secret-key")
    await submit()

    expect(field("templateId")?.getAttribute("aria-invalid")).toBe("true")
    expect(field("templateKey")?.getAttribute("aria-invalid")).not.toBe("true")
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  test("a saved outcome toasts and refreshes", async () => {
    render()
    type(field("templateId"), "55")
    type(field("templateKey"), "secret-key")
    await submit()

    expect(toastMocks.success).toHaveBeenCalledTimes(1)
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(field("templateKey")?.value).toBe("secret-key")
  })

  test("a ready default shows its key, masked until the eye is pressed", () => {
    render({
      settings: { templateId: "55", status: "ready", templateKey: "the-key" },
    })

    expect(field("templateKey")?.value).toBe("the-key")
    expect(field("templateKey")?.type).toBe("password")
    act(() => eye("Show key")?.click())
    expect(field("templateKey")?.type).toBe("text")
    act(() => eye("Hide key")?.click())
    expect(field("templateKey")?.type).toBe("password")
  })

  test.each([
    ["unavailable", "The template ID or key is not valid."],
    ["shareDisabled", "Turn on the template's share link first."],
  ])("a %s rejection shows the translated message on the key field", async (reason, text) => {
    adapter.outcome = { status: "rejected", reason }
    render()
    type(field("templateId"), "55")
    type(field("templateKey"), "secret-key")
    await submit()

    expect(container.textContent).toContain(text)
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  test("uses the reseller actions for the tenant scope and the root ones for the platform scope", () => {
    render({ scope: "tenant" })
    expect(adapter.usedAction).toBe(actions.save)

    render({ scope: "platform" })
    expect(adapter.usedAction).toBe(actions.saveRoot)
  })

  test("Clear asks for confirmation before removing the default", () => {
    render({
      settings: { templateId: "55", status: "ready", templateKey: "k" },
    })

    act(() => button("Clear")?.click())
    expect(document.body.textContent).toContain("Remove the default template?")
    expect(actions.executeClear).not.toHaveBeenCalled()

    act(() =>
      Array.from(document.querySelectorAll("button"))
        .find((candidate) => candidate.textContent?.trim() === "Confirm")
        ?.click(),
    )
    expect(actions.executeClear).toHaveBeenCalledTimes(1)

    act(() => actions.clearCallbacks?.onSuccess())
    expect(toastMocks.success).toHaveBeenCalledTimes(1)
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(field("templateId")?.value).toBe("")
  })
})
