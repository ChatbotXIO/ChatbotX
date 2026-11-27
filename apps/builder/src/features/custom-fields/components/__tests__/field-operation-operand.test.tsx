// @vitest-environment jsdom
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FieldOperationOperand } from "../field-operation-operand"

const mounts: string[] = []

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

vi.mock("@/components/tiptap/plain-text-editor-field", () => ({
  PlainTextEditorField: ({
    name,
    required,
  }: {
    name: string
    required?: boolean
  }) => {
    useEffect(() => {
      mounts.push(`editor:${name}`)
    }, [name])
    return <div data-required={String(!!required)} data-testid="editor" />
  },
}))

vi.mock("@chatbotx.io/ui/components/form/input-field", () => ({
  InputField: ({
    type,
    required,
    step,
  }: {
    type: string
    required?: boolean
    step?: string
  }) => (
    <input
      data-required={String(!!required)}
      data-testid="input"
      step={step}
      type={type}
    />
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mounts.length = 0
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (
  operation: FieldOperationType,
  props: { variables?: boolean } = {},
) =>
  act(() =>
    root.render(
      <FieldOperationOperand
        name="value"
        operation={operation}
        renderTyped={() => <div data-testid="typed" />}
        variables={props.variables ?? false}
      />,
    ),
  )
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`)
const text = () => container.textContent

describe("FieldOperationOperand", () => {
  test.each([
    ["clear", FieldOperationType.clear],
    ["setNow", FieldOperationType.setNow],
  ])("%s renders no operand control", (_n, operation) => {
    render(operation)

    expect(q("input")).toBeNull()
    expect(q("editor")).toBeNull()
    expect(q("typed")).toBeNull()
  })

  test("a typed operand (set) renders the caller's typed control", () => {
    render(FieldOperationType.set)

    expect(q("typed")).not.toBeNull()
    expect(q("input")).toBeNull()
  })

  test("a number operand renders a numeric input without variables", () => {
    render(FieldOperationType.increase)

    expect(q("input")?.getAttribute("type")).toBe("number")
    expect(q("input")?.getAttribute("data-required")).toBe("true")
    // Fractions such as 0.5 hours must pass native validation.
    expect(q("input")?.getAttribute("step")).toBe("any")
  })

  test("text operands render a text input and are optional", () => {
    render(FieldOperationType.append)

    expect(q("input")?.getAttribute("type")).toBe("text")
    expect(q("input")?.getAttribute("data-required")).toBe("false")
  })

  test("with variables enabled the text-like kinds use the variable editor", () => {
    render(FieldOperationType.formula, { variables: true })

    expect(q("editor")?.getAttribute("data-required")).toBe("true")
    expect(q("input")).toBeNull()
  })

  test.each([
    [FieldOperationType.formula, "fields.customField.formulaHint"],
    [
      FieldOperationType.dateExpression,
      "fields.customField.dateExpressionHint",
    ],
  ])("%s shows its hint", (operation, key) => {
    render(operation)

    expect(text()).toContain(key)
  })

  test.each([
    FieldOperationType.set,
    FieldOperationType.append,
    FieldOperationType.increase,
    FieldOperationType.addDays,
    FieldOperationType.clear,
    FieldOperationType.setNow,
  ])("%s shows no hint", (operation) => {
    render(operation)

    expect(text()).not.toContain("Hint")
  })

  test("the control remounts when the operation changes", () => {
    render(FieldOperationType.formula, { variables: true })
    render(FieldOperationType.formula, { variables: true })
    expect(mounts).toEqual(["editor:value"])

    render(FieldOperationType.dateExpression, { variables: true })

    expect(mounts).toEqual(["editor:value", "editor:value"])
  })
})
