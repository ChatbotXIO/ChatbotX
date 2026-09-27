// @vitest-environment jsdom

import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactCustomFieldManage } from "@/features/custom-fields/contact-custom-field-manage"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: () => null,
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: React.ReactNode
    onSelect?: () => void
    value: string
  }) => (
    <button onClick={onSelect} type="button" value={value}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/popover", () => ({
  Popover: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode
    onOpenChange: (open: boolean) => void
  }) => {
    useEffect(() => onOpenChange(true), [onOpenChange])
    return children
  },
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ render }: { render: React.ReactNode }) => render,
}))

vi.mock("@/features/custom-fields/create-custom-field", () => ({
  CreateCustomFieldDialog: () => null,
}))

vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useCustomFields: () => ({
    data: [{ id: "field-1", name: "Birthday", type: "date" }],
  }),
  useCustomFieldSelectOptions: () => [{ label: "Birthday", value: "field-1" }],
  useInvalidateCustomFields: () => vi.fn(),
}))

describe("ContactCustomFieldManage", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("passes the selected field id, name, and validated type to its consumer", async () => {
    const onChooseCustomField = vi.fn()

    await act(() => {
      root.render(
        <ContactCustomFieldManage
          disabledIds={[]}
          onChooseCustomField={onChooseCustomField}
          workspaceId="workspace-1"
        />,
      )
    })

    const fieldOption = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Birthday",
    )
    await act(() => {
      fieldOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onChooseCustomField).toHaveBeenCalledWith({
      id: "field-1",
      name: "Birthday",
      type: "date",
    })
  })
})
