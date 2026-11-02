// @vitest-environment jsdom

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { act, type MutableRefObject, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  FormProvider,
  type UseFormReturn,
  useForm,
  useWatch,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { useFieldOperationReset } from "@/features/custom-fields/lib/use-field-operation-reset"

type Values = { operation: string; value: string }
type Api = {
  form: UseFormReturn<Values>
  onOperationChange: (next?: string) => void
  /** What a control keyed by operation saw in the form when it mounted. */
  mountedWith: string[]
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Stands in for the operand control: remounts per operation, reads the form on mount. */
const Operand = ({
  form,
  mountedWith,
}: {
  form: UseFormReturn<Values>
  mountedWith: string[]
}) => {
  // A state initializer runs once, on mount.
  useState(() => mountedWith.push(form.getValues("value")))
  return null
}

/** Owns a form and hands it to the hook explicitly, like the flow-step dialog. */
const Harness = ({
  fieldType,
  apiRef,
  initial,
}: {
  fieldType: CustomFieldType | null
  apiRef: MutableRefObject<Api | null>
  initial: Values
}) => {
  const form = useForm<Values>({ defaultValues: initial })
  const operation = useWatch({ control: form.control, name: "operation" })
  const { onOperationChange } = useFieldOperationReset({
    operationName: "operation",
    valueName: "value",
    fieldType,
    form: form as unknown as UseFormReturn,
  })
  const mountedWith = apiRef.current?.mountedWith ?? []
  apiRef.current = { form, onOperationChange, mountedWith }
  return <Operand form={form} key={operation} mountedWith={mountedWith} />
}

/** A parent form provider: the hook must ignore it when given its own form. */
const Parent = ({ children }: { children: React.ReactNode }) => {
  const parent = useForm({ defaultValues: { operation: "parent" } })
  return <FormProvider {...parent}>{children}</FormProvider>
}

const render = (
  apiRef: MutableRefObject<Api | null>,
  fieldType: CustomFieldType | null,
  initial: Values,
) =>
  act(() =>
    root.render(
      <Parent>
        <Harness apiRef={apiRef} fieldType={fieldType} initial={initial} />
      </Parent>,
    ),
  )

const mount = (fieldType: CustomFieldType | null, initial: Values) => {
  const apiRef: MutableRefObject<Api | null> = { current: null }
  render(apiRef, fieldType, initial)
  return apiRef
}

/** What the operation select does on a change: set the field, then the callback. */
const choose = (apiRef: MutableRefObject<Api | null>, next: string) =>
  act(() => {
    apiRef.current?.form.setValue("operation", next)
    apiRef.current?.onOperationChange(next)
  })

describe("useFieldOperationReset", () => {
  test("keeps a saved operation and operand on first render", () => {
    const apiRef = mount("number", { operation: "O04", value: "5" })

    expect(apiRef.current?.form.getValues()).toEqual({
      operation: "O04",
      value: "5",
    })
  })

  test.each([
    ["number", "O04", "O05"],
    ["shortText", "O01", "O02"],
    ["datetime", "O10", "O12"],
  ] as const)("%s: %s -> %s keeps an operand of the same kind", (type, from, to) => {
    const apiRef = mount(type, { operation: from, value: "5" })

    choose(apiRef, to)

    expect(apiRef.current?.form.getValues("value")).toBe("5")
  })

  test.each([
    ["number", "O04", "O07"],
    ["number", "O04", "O06"],
    ["datetime", "O10", "O09"],
    ["datetime", "O12", "O08"],
  ] as const)("%s: %s -> %s clears an operand that no longer fits", (type, from, to) => {
    const apiRef = mount(type, { operation: from, value: "5" })

    choose(apiRef, to)

    expect(apiRef.current?.form.getValues("value")).toBe("")
  })

  test("the control that remounts for the new operation starts from the cleared operand", () => {
    const apiRef = mount("number", { operation: "O04", value: "5" })

    choose(apiRef, "O07")

    // Mounted once for O04 (with "5") and once for O07, which must see "".
    expect(apiRef.current?.mountedWith).toEqual(["5", ""])
  })

  test("a control that survives the change is not handed a cleared operand", () => {
    const apiRef = mount("shortText", { operation: "O01", value: "hi" })

    choose(apiRef, "O02")

    expect(apiRef.current?.mountedWith).toEqual(["hi", "hi"])
  })

  test("a field type that does not allow the operation falls back to set and clears the operand", () => {
    const apiRef = mount("number", { operation: "O07", value: "value + 1" })

    render(apiRef, "shortText", { operation: "O07", value: "value + 1" })

    expect(apiRef.current?.form.getValues("operation")).toBe("O01")
    expect(apiRef.current?.form.getValues("value")).toBe("")
    // The remounted control saw the cleared operand, not the stale one.
    expect(apiRef.current?.mountedWith.at(-1)).toBe("")
  })

  test("opening a stored action (the field resolving for the first time) rewrites nothing", () => {
    // O04 on a text field was accepted by the old API; it stays as stored.
    const apiRef = mount(null, { operation: "O04", value: "5" })

    render(apiRef, "shortText", { operation: "O04", value: "5" })

    expect(apiRef.current?.form.getValues()).toEqual({
      operation: "O04",
      value: "5",
    })
  })

  test("an operation the new type still allows is kept", () => {
    const apiRef = mount("number", { operation: "O06", value: "" })

    render(apiRef, "shortText", { operation: "O06", value: "" })

    expect(apiRef.current?.form.getValues("operation")).toBe("O06")
  })

  test("deselecting the field (non-null to null) rewrites nothing", () => {
    const apiRef = mount("number", { operation: "O07", value: "value + 1" })

    render(apiRef, null, { operation: "O07", value: "value + 1" })

    expect(apiRef.current?.form.getValues()).toEqual({
      operation: "O07",
      value: "value + 1",
    })
  })

  test("the first pick clears nothing", () => {
    const apiRef = mount(null, { operation: "", value: "typed first" })

    choose(apiRef, "O02")

    expect(apiRef.current?.form.getValues("value")).toBe("typed first")
  })

  test("nothing is reset before a field is picked", () => {
    const apiRef = mount(null, { operation: "O07", value: "x" })

    expect(apiRef.current?.form.getValues()).toEqual({
      operation: "O07",
      value: "x",
    })
  })
})
