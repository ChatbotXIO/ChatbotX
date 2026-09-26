import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { InputField } from "../src/components/form/input-field"
import { FormOptionalLabelProvider } from "../src/components/form/optional-label-context"

type NameForm = {
  name: string
}

const OptionalFieldHarness = () => {
  const form = useForm<NameForm>({ defaultValues: { name: "" } })
  return (
    <FormProvider {...form}>
      <InputField<NameForm> label="Name" name="name" />
    </FormProvider>
  )
}

describe("FormFieldWrapper optional marker", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("renders (optional) when no provider is mounted", () => {
    act(() => {
      root.render(<OptionalFieldHarness />)
    })

    expect(container.textContent).toContain("(optional)")
  })

  test("renders the label given by FormOptionalLabelProvider", () => {
    act(() => {
      root.render(
        <FormOptionalLabelProvider value="(opcional)">
          <OptionalFieldHarness />
        </FormOptionalLabelProvider>,
      )
    })

    expect(container.textContent).toContain("(opcional)")
    expect(container.textContent).not.toContain("(optional)")
  })
})
