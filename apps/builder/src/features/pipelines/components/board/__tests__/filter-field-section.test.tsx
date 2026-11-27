// @vitest-environment jsdom
import { PIPELINE_FIELD_OPERATORS_BY_TYPE } from "@chatbotx.io/database/partials"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { FieldCondition } from "../filter-helpers"

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

// The app date picker is a popover button; a plain day input keeps the test on
// which operand editor the section picks and what value it holds.
vi.mock("../filter-day-picker", () => ({
  FilterDayPicker: ({ value, label }: { value?: string; label: string }) => (
    <input aria-label={label} readOnly type="date" value={value ?? ""} />
  ),
}))

// The base-ui select only mounts its list when opened; a native select keeps
// the test on FilterFieldSection's own branching.
vi.mock("../../shared/option-select", () => ({
  OptionSelect: ({
    value,
    options,
    ariaLabel,
    onValueChange,
  }: {
    value: string
    options: Array<{ value: string; label: string }>
    ariaLabel?: string
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label={ariaLabel}
      data-testid="boolean-select"
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      <option value="">any</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

import { FilterFieldSection } from "../filter-field-section"

const OPERATOR_LABEL: Record<string, string> = {
  is: "fields.operator.is",
  isNot: "fields.operator.isNot",
  hasValue: "fields.operator.isNotEmpty",
  noValue: "fields.operator.isEmpty",
  contains: "fields.operator.contains",
  notContains: "fields.operator.notContains",
  startsWith: "fields.operator.startsWith",
  endsWith: "fields.operator.endsWith",
  gt: "fields.operator.gt",
  lt: "fields.operator.lt",
  between: "fields.operator.isBetween",
}

describe("FilterFieldSection", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    type: CustomFieldType,
    condition?: FieldCondition,
    onChange: (next: FieldCondition | undefined) => void = () => undefined,
  ) => {
    act(() =>
      root.render(
        <FilterFieldSection
          condition={condition}
          field={{
            id: "5",
            name: "Field",
            referenceName: "field",
            type,
            required: false,
          }}
          onChange={onChange}
        />,
      ),
    )
  }

  const labels = () =>
    Array.from(container.querySelectorAll("label")).map((label) =>
      label.textContent?.trim(),
    )
  const inputs = () =>
    Array.from(container.querySelectorAll("input:not([role])"))
  const operandInputs = () =>
    inputs().filter(
      (input) =>
        (input as HTMLInputElement).type !== "radio" &&
        input.tagName === "INPUT",
    ) as HTMLInputElement[]

  test.each(
    Object.entries(PIPELINE_FIELD_OPERATORS_BY_TYPE),
  )("%s lists its operators in display order", (type, operators) => {
    render(type as CustomFieldType)

    expect(labels()).toEqual(
      operators.map((operator) => OPERATOR_LABEL[operator]),
    )
  })

  test("nothing selected shows no operand input", () => {
    render("shortText")

    expect(operandInputs()).toHaveLength(0)
    expect(
      container.querySelector('[role="radio"][aria-checked="true"]'),
    ).toBeNull()
  })

  test.each([
    ["shortText", "text"],
    ["email", "text"],
    ["number", "number"],
    ["date", "date"],
    ["datetime", "date"],
  ] as const)("%s edits its operand with a %s input", (type, inputType) => {
    render(type, { operator: "is", value: "x" })

    expect(operandInputs()).toHaveLength(1)
    expect(operandInputs()[0]?.type).toBe(inputType)
  })

  test.each([
    "hasValue",
    "noValue",
  ] as const)("%s needs no operand input", (operator) => {
    render("number", { operator })

    expect(operandInputs()).toHaveLength(0)
  })

  test("an interval shows a lower and an upper input of the field's kind", () => {
    render("date", {
      operator: "between",
      value: "2026-01-01",
      valueTo: "2026-02-01",
    })

    const [lower, upper] = operandInputs()
    expect(operandInputs()).toHaveLength(2)
    expect([lower?.type, upper?.type]).toEqual(["date", "date"])
    expect([lower?.value, upper?.value]).toEqual(["2026-01-01", "2026-02-01"])
  })

  test("a boolean field picks its operand from a Yes/No select", () => {
    render("boolean", { operator: "is", value: "true" })

    const select = container.querySelector<HTMLSelectElement>(
      '[data-testid="boolean-select"]',
    )
    expect(select?.value).toBe("true")
    expect(
      Array.from(select?.options ?? []).map((option) => option.value),
    ).toEqual(["", "true", "false"])
    expect(operandInputs()).toHaveLength(0)
  })

  test("typing an operand reports the condition with the same operator", () => {
    const onChange = vi.fn()
    render("number", { operator: "gt" }, onChange)

    const input = operandInputs()[0] as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(input, "42")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith({ operator: "gt", value: "42" })
  })
})
