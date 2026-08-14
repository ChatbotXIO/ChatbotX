// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CapiMethodChooser } from "@/features/meta-conversions/components/capi-method-chooser"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const mockUseAction = vi.fn((..._args: unknown[]) => ({
  execute: vi.fn(),
  isPending: false,
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (...args: unknown[]) => mockUseAction(...args),
}))

vi.mock("@/features/meta-conversions/components/capi-dataset-card", () => ({
  CapiDatasetCard: () => <div data-testid="dataset-card" />,
}))

describe("CapiMethodChooser", () => {
  let container: HTMLDivElement
  let root: Root
  let connectCustom: ReturnType<typeof vi.fn>
  let setDataset: ReturnType<typeof vi.fn>
  let provision: ReturnType<typeof vi.fn>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    connectCustom = vi.fn()
    setDataset = vi.fn()
    provision = vi.fn()
    mockUseAction.mockClear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render(primaryMethod?: "oauth" | "whatsapp") {
    act(() => {
      root.render(
        <CapiMethodChooser
          actions={
            { connectCustom, setDataset, provision } as unknown as Parameters<
              typeof CapiMethodChooser
            >[0]["actions"]
          }
          datasetId={null}
          integrationId="int-1"
          primaryMethod={primaryMethod}
          workspaceId="ws-1"
        />,
      )
    })
  }

  function findButton(text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === text,
    )
  }

  test("Connect via Facebook reveals the dataset step without calling a server action", () => {
    render()

    const connectButton = findButton("metaConversions.methods.oauth.connect")
    expect(connectButton).toBeDefined()

    act(() => {
      connectButton?.click()
    })

    expect(
      container.querySelector('[data-testid="dataset-card"]'),
    ).not.toBeNull()
    expect(connectCustom).not.toHaveBeenCalled()
    expect(setDataset).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
  })

  test("custom connection card still works", () => {
    render()

    const startButton = findButton("metaConversions.methods.custom.start")
    expect(startButton).toBeDefined()

    act(() => {
      startButton?.click()
    })

    // Reveals the dataset id + access token inputs.
    expect(container.querySelectorAll("input").length).toBe(2)
    expect(findButton("metaConversions.methods.custom.connect")).toBeDefined()
  })

  test('primaryMethod="whatsapp" renders the WhatsApp connect copy instead of Facebook', () => {
    render("whatsapp")

    expect(findButton("metaConversions.methods.whatsapp.connect")).toBeDefined()
    expect(findButton("metaConversions.methods.oauth.connect")).toBeUndefined()
  })
})
