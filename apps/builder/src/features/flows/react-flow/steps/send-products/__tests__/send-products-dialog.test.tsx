// @vitest-environment jsdom
import {
  type SendProductsStepSchema,
  sendProductsStepDefaultFn,
} from "@chatbotx.io/flow-config"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import type { ComponentProps } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { SendProductsDialog } from "../components/send-products-dialog"
import type { SendProductsFormValues } from "../lib/form"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

// The real picker talks to the API; the dialog only cares about the ids it hands back.
const pickerProps: ComponentProps<
  typeof import("../components/product-multi-select").ProductMultiSelect
>[] = []
let nextProductId = 100
vi.mock("../components/product-multi-select", () => ({
  ProductMultiSelect: (props: {
    value: string[]
    onChange: (ids: string[]) => void
    max: number
    excludeIds?: string[]
  }) => {
    pickerProps.push(props as never)
    return (
      <div data-max={props.max} data-testid="picker">
        <button
          data-testid="pick"
          onClick={() => {
            nextProductId += 1
            props.onChange([...props.value, String(nextProductId)])
          }}
          type="button"
        >
          add
        </button>
        <button
          data-testid="clear"
          onClick={() => props.onChange([])}
          type="button"
        >
          clear
        </button>
        <span data-testid="picked">{props.value.join(",")}</span>
      </div>
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: (props: {
    options: Array<{ value: string; label: string }>
    onValueChange?: (value: string) => void
    name: string
  }) => (
    <select
      data-testid={`select-${props.name}`}
      onChange={(event) => props.onValueChange?.(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

let container: HTMLDivElement
let root: Root
const onSave = vi.fn<(values: SendProductsFormValues) => void>()
const onOpenChange = vi.fn<(open: boolean) => void>()

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
  pickerProps.length = 0
  nextProductId = 100
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

const open = (
  step: Partial<SendProductsStepSchema> = {},
  channel: ChannelType = "whatsapp",
) =>
  act(() =>
    root.render(
      <SendProductsDialog
        channel={channel}
        onOpenChange={onOpenChange}
        onSave={onSave}
        open
        step={sendProductsStepDefaultFn(step)}
      />,
    ),
  )

const byText = (text: string) =>
  Array.from(document.body.querySelectorAll("button, label, p")).find(
    (element) => element.textContent?.includes(text),
  ) as HTMLElement | undefined
const picks = () =>
  document.body.querySelectorAll<HTMLButtonElement>('[data-testid="pick"]')
const continueButton = () => byText("actions.continue") as HTMLButtonElement
const field = (name: string) =>
  document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  )

const click = (element: HTMLElement | null | undefined) =>
  act(() => {
    element?.click()
  })

/** react-hook-form resolves a submit on later microtasks. */
const submit = (element: HTMLElement | null | undefined) =>
  act(async () => {
    element?.click()
    await Promise.resolve()
  })

const type = (
  element: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
) =>
  act(() => {
    if (!element) {
      throw new Error("field not found")
    }
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      element,
      value,
    )
    element.dispatchEvent(new Event("input", { bubbles: true }))
  })

const choose = (select: HTMLElement | null, value: string) =>
  act(() => {
    const element = select as HTMLSelectElement
    element.value = value
    element.dispatchEvent(new Event("change", { bubbles: true }))
  })

describe("SendProductsDialog — products display", () => {
  test("starts collapsed: just the picker, with the extra fields behind More Options", () => {
    open({ sections: [{ productIds: ["1"] }] })

    expect(
      document.body.querySelectorAll('[data-testid="picker"]'),
    ).toHaveLength(1)
    expect(field("header")).toBeNull()
    expect(field("body")).toBeNull()
    expect(byText("flows.sendProducts.moreOptions")).toBeDefined()
    expect(continueButton().disabled).toBe(false)
  })

  test("More Options reveals body and footer, never a header for a single product", () => {
    open({ sections: [{ productIds: ["1"] }] })

    click(byText("flows.sendProducts.moreOptions"))

    expect(field("body")).not.toBeNull()
    expect(field("footer")).not.toBeNull()
    expect(field("header")).toBeNull()
    expect(byText("flows.sendProducts.fewerOptions")).toBeDefined()
  })

  test("a second product opens the text fields and blocks Continue until they are filled", () => {
    open({ sections: [{ productIds: ["1"] }] })

    click(picks()[0] ?? null)

    expect(field("header")).not.toBeNull()
    expect(field("body")).not.toBeNull()
    expect(continueButton().disabled).toBe(true)
    expect(document.body.textContent).toContain(
      "messages.sendProductsFieldRequired",
    )

    type(field("header"), "Our picks")
    type(field("body"), "Have a look")

    expect(continueButton().disabled).toBe(false)
  })

  test("an empty section reports the missing products once, not once per level", () => {
    open({ sections: [{ productIds: [] }] })

    const message = "messages.sendProductsProductCountOutOfRange"
    expect(document.body.textContent?.split(message).length).toBe(2)
  })

  test("a headline that is no longer allowed stays visible so it can be cleared", () => {
    open({
      header: "Our picks",
      body: "Have a look",
      sections: [{ productIds: ["1"] }],
    })

    expect(field("header")).not.toBeNull()
    expect(document.body.textContent).toContain(
      "messages.sendProductsFieldNotAllowed",
    )
    expect(continueButton().disabled).toBe(true)

    type(field("header"), "")

    expect(field("header")).toBeNull()
    expect(continueButton().disabled).toBe(false)
  })

  test("marks body optional for a single product and required for several", () => {
    const bodyLabel = () =>
      Array.from(document.body.querySelectorAll("label"))
        .map((label) => label.textContent ?? "")
        .find((text) => text.includes("flows.sendProducts.body")) ?? ""

    open({ sections: [{ productIds: ["1"] }] })
    click(byText("flows.sendProducts.moreOptions"))
    expect(bodyLabel()).toContain("optional")

    click(picks()[0] ?? null)
    expect(bodyLabel()).not.toContain("optional")
  })

  test("shows the product count against the channel limit", () => {
    open({ sections: [{ productIds: ["1", "2"] }], header: "h", body: "b" })

    expect(document.body.textContent).toContain('"count":2')
    expect(document.body.textContent).toContain('"max":30')
  })

  test("each section's picker may only take what the others leave, and excludes their products", () => {
    open({
      header: "h",
      body: "b",
      sections: [
        { title: "A", productIds: ["1", "2"] },
        { title: "B", productIds: ["3"] },
      ],
    })

    const secondSection = pickerProps.at(-1)
    expect(secondSection?.excludeIds).toEqual(["1", "2"])
    expect(secondSection?.max).toBe(30 - 2)
  })

  test("Add section appends a titled section and stops at the channel's section limit", () => {
    open({
      header: "h",
      body: "b",
      sections: Array.from({ length: 9 }, (_, index) => ({
        title: `s${index}`,
        productIds: [String(index + 1)],
      })),
    })

    const add = byText("flows.sendProducts.addSection") as HTMLButtonElement
    expect(add.disabled).toBe(false)
    click(add)

    expect(
      document.body.querySelectorAll('[data-testid="picker"]'),
    ).toHaveLength(10)
    expect(
      (byText("flows.sendProducts.addSection") as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  test("saves the values and closes", async () => {
    open({
      header: "  Our picks ",
      body: "Have a look",
      sections: [{ title: "Shoes", productIds: ["1", "2"] }],
    })

    await submit(continueButton())

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      display: "products",
      header: "  Our picks ",
      body: "Have a look",
      sections: [{ title: "Shoes", productIds: ["1", "2"] }],
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test("Cancel closes without saving", () => {
    open({ sections: [{ productIds: ["1"] }] })

    click(byText("actions.cancel"))

    expect(onSave).not.toHaveBeenCalled()
  })
})

describe("SendProductsDialog — other displays", () => {
  test("switching to carousel keeps the products as one flat list and asks only for a body", () => {
    open({
      header: "h",
      body: "b",
      sections: [{ title: "A", productIds: ["1", "2"] }],
    })

    choose(
      document.body.querySelector('[data-testid="select-display"]'),
      "carousel",
    )

    expect(
      document.body.querySelector('[data-testid="picked"]')?.textContent,
    ).toBe("1,2")
    expect(field("header")).toBeNull()
    expect(field("footer")).toBeNull()
    expect(field("body")).not.toBeNull()
  })

  test("a channel with no product messages says so instead of showing a form", () => {
    open({ sections: [{ productIds: ["1"] }] }, "messenger")

    expect(document.body.textContent).toContain(
      "flows.sendProducts.channelUnsupported",
    )
    expect(document.body.querySelector('[data-testid="picker"]')).toBeNull()
  })
})
