// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const execute = vi.fn()

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute, isPending: false }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("../../../actions/pipeline.action", () => ({
  createPipelineAction: { bind: () => vi.fn() },
}))
vi.mock("../../../lib/use-invalidate-pipelines", () => ({
  useInvalidatePipelines: () => vi.fn(),
}))
vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import { CreatePipelineForm } from "../create-pipeline-dialog"

describe("CreatePipelineForm", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    execute.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() =>
      root.render(<CreatePipelineForm onCreated={vi.fn()} workspaceId="7" />),
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const radio = (type: string) =>
    container.querySelector<HTMLInputElement>(`input[value="${type}"]`)
  const nameInput = () =>
    container.querySelector<HTMLInputElement>("#pipeline-name")
  const pick = (type: string) => act(() => radio(type)?.click())
  const typeName = (value: string) =>
    act(() => {
      const input = nameInput()
      if (!input) {
        return
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  const submit = () =>
    act(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        )
    })

  test("nothing is preselected and the name field waits for a type", () => {
    for (const type of ["opportunity", "ticket", "custom"]) {
      expect(radio(type)?.checked).toBe(false)
    }
    expect(nameInput()).toBeNull()
  })

  test("picking a type shows the name prefilled with the type's name", () => {
    pick("ticket")

    expect(radio("ticket")?.checked).toBe(true)
    expect(nameInput()?.value).toBe("types.ticket.label")
  })

  test("the default name follows the type until the user types their own", () => {
    pick("ticket")
    pick("custom")
    expect(nameInput()?.value).toBe("types.custom.label")

    typeName("Support VN")
    pick("ticket")
    expect(nameInput()?.value).toBe("Support VN")
  })

  test("submits the picked type with the trimmed name", () => {
    pick("ticket")
    typeName("  Support VN  ")
    submit()

    expect(execute).toHaveBeenCalledExactlyOnceWith({
      type: "ticket",
      name: "Support VN",
    })
  })

  test("a blank name does not submit", () => {
    pick("custom")
    typeName("   ")
    submit()

    expect(execute).not.toHaveBeenCalled()
  })
})
