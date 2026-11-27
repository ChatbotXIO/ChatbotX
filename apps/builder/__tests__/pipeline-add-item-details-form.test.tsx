// @vitest-environment jsdom

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { useForm } from "react-hook-form"
import { describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/features/users/provider/user-hook", () => ({
  useContactAssigneeMultiSelectOptions: () => [],
}))
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
}))

import { AddItemDetailsForm } from "@/features/pipelines/components/add-item/add-item-details-form"
import { initialAddItemFormValues } from "@/features/pipelines/lib/add-item-form"

const settings = (value: boolean, priority: boolean, dueDate: boolean) =>
  ({
    visibleFeatures: { value, priority, dueDate },
    statusLabels: { open: "Open", won: "Won", lost: "Lost" },
  }) as never

function Host({
  features,
  onValues,
}: {
  features: [boolean, boolean, boolean]
  onValues?: (values: unknown) => void
}) {
  const form = useForm({
    defaultValues: initialAddItemFormValues(["f1"]),
  })
  onValues?.(form)
  return (
    <Form {...form}>
      <AddItemDetailsForm
        fields={[
          { id: "f1", name: "Source", type: "shortText", required: true },
        ]}
        files={[]}
        onFilesChange={() => undefined}
        openStages={[{ id: "s1", name: "New" }]}
        pipeline={{ currency: "USD", settings: settings(...features) }}
        workspaceId="ws"
      />
    </Form>
  )
}

function mount(node: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { container, unmount: () => act(() => root.unmount()) }
}

describe("AddItemDetailsForm", () => {
  test("shows the currency as a suffix on the value input", () => {
    const { container, unmount } = mount(<Host features={[true, true, true]} />)
    expect(container.textContent).toContain("USD")
    expect(container.textContent).toContain("item.value")
    unmount()
  })

  test("hides value, priority and due date when their features are off", () => {
    const { container, unmount } = mount(
      <Host features={[false, false, false]} />,
    )
    expect(container.textContent).not.toContain("USD")
    expect(container.textContent).not.toContain("item.value")
    expect(container.textContent).not.toContain("item.priority")
    expect(container.textContent).not.toContain("item.dueDate")
    expect(container.textContent).toContain("item.status")
    unmount()
  })

  test("limits the value to four decimals", () => {
    let form: { getValues: (n: string) => unknown } | undefined
    const { container, unmount } = mount(
      <Host
        features={[true, true, true]}
        onValues={(f) => (form = f as never)}
      />,
    )
    // 0 = title, 1 = value
    const input = container.querySelectorAll("input")[1] as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      setter?.call(input, "1.123456")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(form?.getValues("value")).toBe(1.1234)
    unmount()
  })

  test("a required custom field carries no optional marker, like the other required fields", () => {
    const { container, unmount } = mount(<Host features={[true, true, true]} />)
    expect(container.querySelector("#add-item-field-f1")?.textContent).toBe(
      "Source",
    )
    unmount()
  })

  test("names each custom field input by its label", () => {
    const { container, unmount } = mount(<Host features={[true, true, true]} />)
    const input = container.querySelector(
      '[aria-labelledby="add-item-field-f1"]',
    )
    expect(input).not.toBeNull()
    expect(container.querySelector("#add-item-field-f1")?.textContent).toBe(
      "Source",
    )
    expect(input?.getAttribute("maxlength")).toBe("5000")
    unmount()
  })
})
