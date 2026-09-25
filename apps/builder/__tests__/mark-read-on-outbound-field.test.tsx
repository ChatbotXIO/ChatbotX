import { Form } from "@chatbotx.io/ui/components/ui/form"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm, useWatch } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "inboxes.markReadOnOutbound.enabled": "Enabled",
      "inboxes.markReadOnOutbound.disabled": "Disabled",
    })[key] ?? key,
}))

vi.mock("@chatbotx.io/ui/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }) => (
    <button
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    />
  ),
}))

const useActionMock = vi.fn()

vi.mock("next-safe-action/hooks", () => ({
  useAction: useActionMock,
}))

const { MarkReadOnOutboundField } = await import(
  "@/features/inboxes/components/mark-read-on-outbound-field"
)

function TestForm() {
  const form = useForm({
    defaultValues: { markReadOnOutbound: false },
  })
  const value = useWatch({
    control: form.control,
    name: "markReadOnOutbound",
  })

  return (
    <Form {...form}>
      <MarkReadOnOutboundField />
      <output>{String(value)}</output>
    </Form>
  )
}

describe("MarkReadOnOutboundField", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("updates the form value and state text without invoking an action", () => {
    act(() => root.render(<TestForm />))

    const toggle = container.querySelector<HTMLButtonElement>("[role=switch]")
    expect(toggle?.getAttribute("aria-checked")).toBe("false")
    expect(container.textContent).toContain("Disabled")
    expect(container.querySelector("output")?.textContent).toBe("false")

    act(() => toggle?.click())

    expect(toggle?.getAttribute("aria-checked")).toBe("true")
    expect(container.textContent).toContain("Enabled")
    expect(container.querySelector("output")?.textContent).toBe("true")
    expect(useActionMock).not.toHaveBeenCalled()
  })
})
