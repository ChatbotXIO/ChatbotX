// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CapiDatasetCard } from "@/features/meta-conversions/components/capi-dataset-card"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// The card calls `useAction` twice, in order: setDataset then provision. Each
// call gets its own `execute` spy so a test can assert which action ran.
const executes: ReturnType<typeof vi.fn>[] = []
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => {
    const execute = vi.fn()
    executes.push(execute)
    return { execute, isPending: false }
  },
}))

const SAVE_LABEL = "metaConversions.finalize.save"
const CREATE_LABEL = "metaConversions.finalize.createDataset"

describe("CapiDatasetCard", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    executes.length = 0
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render() {
    const setDataset = vi.fn()
    const provision = vi.fn()
    act(() => {
      root.render(
        <CapiDatasetCard
          actions={
            { setDataset, provision } as unknown as Parameters<
              typeof CapiDatasetCard
            >[0]["actions"]
          }
          integrationId="int-1"
          workspaceId="ws-1"
        />,
      )
    })
  }

  // Each render pushes a fresh [setDataset, provision] execute pair; the button
  // click runs the latest render's pair.
  function latestExecutes() {
    return {
      setDatasetExecute: executes.at(-2),
      provisionExecute: executes.at(-1),
    }
  }

  function button(): HTMLButtonElement {
    const found = container.querySelector("button")
    if (!found) {
      throw new Error("button not rendered")
    }
    return found
  }

  function typeDatasetId(value: string) {
    const input = container.querySelector("input")
    if (!input) {
      throw new Error("input not rendered")
    }
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  test("shows Create Dataset and auto-provisions when the field is empty", () => {
    render()

    expect(button().textContent).toBe(CREATE_LABEL)

    act(() => {
      button().click()
    })

    const { setDatasetExecute, provisionExecute } = latestExecutes()
    expect(provisionExecute).toHaveBeenCalledWith()
    expect(setDatasetExecute).not.toHaveBeenCalled()
  })

  test("shows Save and validates the pasted id when the field is filled", () => {
    render()

    typeDatasetId("  913591454696998  ")
    expect(button().textContent).toBe(SAVE_LABEL)

    act(() => {
      button().click()
    })

    const { setDatasetExecute, provisionExecute } = latestExecutes()
    expect(setDatasetExecute).toHaveBeenCalledWith({
      datasetId: "913591454696998",
    })
    expect(provisionExecute).not.toHaveBeenCalled()
  })

  test("rejects a non-numeric Dataset ID with an inline error and a disabled Save", () => {
    render()

    typeDatasetId("adasdad")

    // Still the Save action (field is non-empty), but blocked.
    expect(button().textContent).toBe(SAVE_LABEL)
    expect(button().disabled).toBe(true)
    expect(container.textContent).toContain(
      "metaConversions.errors.invalidDatasetId",
    )

    act(() => {
      button().click()
    })

    const { setDatasetExecute, provisionExecute } = latestExecutes()
    expect(setDatasetExecute).not.toHaveBeenCalled()
    expect(provisionExecute).not.toHaveBeenCalled()
  })

  test("reverts to Create Dataset when the field is cleared", () => {
    render()

    typeDatasetId("913591454696998")
    expect(button().textContent).toBe(SAVE_LABEL)

    typeDatasetId("")
    expect(button().textContent).toBe(CREATE_LABEL)
  })
})
