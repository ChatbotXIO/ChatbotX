import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { TagsInputField } from "../src/components/ui/muhammada86/tags-input-field"

type TagsForm = {
  tags: string[]
}

const TagsInputHarness = ({ tags = [] }: { tags?: string[] }) => {
  const form = useForm<TagsForm>({
    defaultValues: {
      tags,
    },
  })

  return (
    <FormProvider {...form}>
      <TagsInputField<TagsForm>
        label="Tags"
        name="tags"
        suggestions={["alpha", "beta", "gamma"]}
      />
    </FormProvider>
  )
}

describe("TagsInputField", () => {
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

  test("shows every suggestion when the right-side dropdown button is clicked", () => {
    act(() => {
      root.render(<TagsInputHarness />)
    })

    expect(container.textContent).not.toContain("alpha")
    expect(container.textContent).not.toContain("beta")
    expect(container.textContent).not.toContain("gamma")

    const dropdownButton = container.querySelector("button")
    expect(dropdownButton).not.toBeNull()

    act(() => {
      dropdownButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(container.textContent).toContain("alpha")
    expect(container.textContent).toContain("beta")
    expect(container.textContent).toContain("gamma")
  })

  test("disables suggestions that are already selected", () => {
    act(() => {
      root.render(<TagsInputHarness tags={["alpha"]} />)
    })

    const dropdownButton = Array.from(container.querySelectorAll("button")).at(
      -1,
    )
    expect(dropdownButton).not.toBeUndefined()

    act(() => {
      dropdownButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const suggestionButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button.w-full"),
    )
    const selectedSuggestion = suggestionButtons.find((button) =>
      button.textContent?.includes("alpha"),
    )
    const availableSuggestion = suggestionButtons.find((button) =>
      button.textContent?.includes("beta"),
    )

    expect(selectedSuggestion?.disabled).toBe(true)
    expect(selectedSuggestion?.className).toContain("disabled:opacity-50")
    expect(availableSuggestion?.disabled).toBe(false)
  })
})
