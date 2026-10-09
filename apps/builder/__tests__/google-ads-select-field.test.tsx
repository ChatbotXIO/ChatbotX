// @vitest-environment jsdom
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { act } from "react"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { GoogleAdsSelectField } from "@/features/integration-google-ads/components/google-ads-select-field"
import { type Mounted, mount } from "./helpers/google-ads-ui"

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => `t:${key}`, { has: () => true }),
}))

const OPTIONS = [
  { value: "1", label: "One" },
  { value: "2", label: "Two", disabled: true },
]

let formRef: ReturnType<typeof useForm<{ action: string }>>

const Harness = ({ onPick }: { onPick?: (value: string) => void }) => {
  const form = useForm<{ action: string }>({ defaultValues: { action: "" } })
  formRef = form
  return (
    <Form {...form}>
      <GoogleAdsSelectField
        ariaLabel="Conversion action"
        description="Hint"
        name="action"
        onPick={onPick}
        options={OPTIONS}
        placeholder="Pick one"
      />
    </Form>
  )
}

let ui: Mounted
beforeEach(() => {
  ui = mount()
})
afterEach(() => ui.unmount())

describe("GoogleAdsSelectField", () => {
  test("the trigger carries the accessible name and the description", () => {
    ui.render(<Harness />)
    const trigger = ui.container.querySelector('[role="combobox"]')
    expect(trigger?.getAttribute("aria-label")).toBe("Conversion action")
    expect(trigger?.getAttribute("aria-describedby")).toBeTruthy()
    expect(ui.container.textContent).toContain("Hint")
  })

  test("a validation key stays hidden until the field is touched or changed, then is translated", () => {
    ui.render(<Harness />)
    act(() => {
      formRef.setError("action", { type: "custom", message: "some.key" })
    })
    expect(ui.container.querySelector('[role="alert"]')).toBeNull()

    act(() => formRef.setValue("action", "1", { shouldDirty: true }))
    act(() => {
      formRef.setError("action", { type: "custom", message: "some.key" })
    })
    expect(ui.container.querySelector('[role="alert"]')?.textContent).toBe(
      "t:some.key",
    )
  })
})
