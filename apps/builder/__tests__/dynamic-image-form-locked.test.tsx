// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { DynamicImageResource } from "@/features/dynamic-images/schema/resource"
import { UpdateDynamicImageForm } from "@/features/dynamic-images/update-dynamic-image-form"
import { LockedEditorProvider } from "@/features/templates/components/locked-editor"
import messages from "../messages/en.json"

const submission = vi.hoisted(() => ({
  defer: false,
  release: (): void => undefined,
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/filesystem", () => ({}))
vi.mock("@/lib/auth/utils", () => ({}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ workspaceId: "2" }),
}))
vi.mock(
  "@/features/dynamic-images/actions/update-dynamic-image.action",
  () => ({
    updateDynamicImageAction: {
      bind: () =>
        vi.fn(() =>
          submission.defer
            ? new Promise((resolve) => {
                submission.release = () => resolve({ data: { success: true } })
              })
            : Promise.resolve({ data: { success: true } }),
        ),
    },
  }),
)
vi.mock("@/features/dynamic-images/components/dynamic-image-editor", () => ({
  DynamicImageEditor: () => null,
}))
vi.mock("@/features/dynamic-images/components/template-picker", () => ({
  DynamicImageTemplatePicker: () => null,
}))
vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useCustomFieldSelectOptions: () => [
    { value: "11", label: "Cache field" },
    { value: "12", label: "Other field" },
  ],
}))

const dynamicImage = {
  id: "1",
  workspaceId: "2",
  name: "Banner",
  customFieldId: null,
  data: { width: 100, height: 100, elements: [] },
} as unknown as DynamicImageResource

describe("dynamic image form on a View-only template copy", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (locked: boolean) => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <LockedEditorProvider locked={locked}>
            <UpdateDynamicImageForm
              dynamicImage={dynamicImage}
              publicUrl="https://example.test/p"
              workspaceId="2"
            />
          </LockedEditorProvider>
        </NextIntlClientProvider>,
      )
    })
  }

  const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (el) => (el.textContent ?? "").trim() === label,
    ) as HTMLButtonElement

  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    globalThis.ResizeObserver ??= vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })) as unknown as typeof ResizeObserver
    Element.prototype.scrollIntoView ??= vi.fn()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("locked: Save disabled until the custom field changes, name stays locked", async () => {
    render(true)
    await settle()
    expect(button(messages.actions.save).disabled).toBe(true)
    const nameInput = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement
    expect(nameInput.closest("fieldset")?.disabled).toBe(true)

    const trigger = container.querySelector(
      '[role="combobox"]',
    ) as HTMLButtonElement
    expect(trigger.closest("fieldset")).toBeNull()

    act(() => {
      trigger.click()
    })
    const item = Array.from(
      document.querySelectorAll('[cmdk-item], [role="option"]'),
    ).find((el) => el.textContent?.includes("Cache field")) as HTMLElement
    act(() => {
      item.click()
    })
    await settle()

    expect(button(messages.actions.save).disabled).toBe(false)
  })

  test("locked: after saving a cache field, clearing it re-enables Save", async () => {
    render(true)
    await settle()
    const trigger = container.querySelector(
      '[role="combobox"]',
    ) as HTMLButtonElement
    const pick = (text: string) => {
      act(() => {
        trigger.click()
      })
      const item = Array.from(
        document.querySelectorAll('[cmdk-item], [role="option"]'),
      ).find((el) => el.textContent?.includes(text)) as HTMLElement
      act(() => {
        item.click()
      })
    }

    pick("Cache field")
    await settle()
    expect(button(messages.actions.save).disabled).toBe(false)

    const form = container.querySelector("form") as HTMLFormElement
    await act(async () => {
      form.requestSubmit()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await settle()
    // Saved value is the new baseline: nothing changed since, so disabled.
    expect(button(messages.actions.save).disabled).toBe(true)

    pick("----")
    await settle()
    expect(button(messages.actions.save).disabled).toBe(false)
  })

  test("locked: a field changed while the save is in flight stays dirty", async () => {
    render(true)
    await settle()
    const trigger = container.querySelector(
      '[role="combobox"]',
    ) as HTMLButtonElement
    const pick = (text: string) => {
      act(() => {
        trigger.click()
      })
      const item = Array.from(
        document.querySelectorAll('[cmdk-item], [role="option"]'),
      ).find((el) => el.textContent?.includes(text)) as HTMLElement
      act(() => {
        item.click()
      })
    }

    pick("Cache field")
    await settle()
    submission.defer = true
    const form = container.querySelector("form") as HTMLFormElement
    await act(async () => {
      form.requestSubmit()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    pick("Other field")
    await settle()
    await act(async () => {
      submission.release()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await settle()
    submission.defer = false

    // The server saved "Cache field"; "Other field" is still an unsaved edit.
    expect(button(messages.actions.save).disabled).toBe(false)
  })

  test("unlocked: Save enabled when valid", async () => {
    render(false)
    await settle()
    expect(button(messages.actions.save).disabled).toBe(false)
  })
})
