// @vitest-environment jsdom

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInboxOptionsForChannels: () => [
    { value: "i1", label: "Page A" },
    { value: "i2", label: "Page B" },
  ],
}))
vi.mock(
  "@/features/contact-filter/components/contact-filter-condition-dialog",
  () => ({ ChannelPostValueField: () => null }),
)
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/combobox-field", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
    ComboboxField: ({
      name,
      options,
      triggerValueChange,
    }: {
      name: string
      options: { value: string; label: string }[]
      triggerValueChange?: (value: string) => void
    }) => {
      const form = useFormContext()
      return (
        <ul data-name={name}>
          {options.map((option) => (
            <li key={option.value}>
              <button
                data-value={option.value}
                onClick={() => {
                  form.setValue(name, option.value)
                  triggerValueChange?.(option.value)
                }}
                type="button"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )
    },
  }
})

import { PostCommentCondition } from "@/features/conditions/post-comment-condition"

type Values = {
  c: {
    sourceId: string | null
    value: { scope: string; channelPostIds: string[] }
  }
}

let form: UseFormReturn<Values> | null = null

function Host({ defaults }: { defaults: Values }) {
  const methods = useForm<Values>({ defaultValues: defaults })
  form = methods
  return (
    <Form {...methods}>
      <PostCommentCondition parentName="c" />
    </Form>
  )
}

const containers: HTMLElement[] = []

function mount(defaults: Values) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement("div")
  document.body.append(container)
  containers.push(container)
  act(() => {
    createRoot(container).render(<Host defaults={defaults} />)
  })
  return container
}

const pick = (container: HTMLElement, value: string) =>
  act(() => {
    container
      .querySelector<HTMLElement>(
        `[data-name="c.sourceId"] [data-value="${value}"]`,
      )
      ?.click()
  })

const selected = {
  c: { sourceId: "i1", value: { scope: "selected", channelPostIds: ["9"] } },
}

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove()
  }
  form = null
})

describe("PostCommentCondition page and posts", () => {
  test("choosing another page clears the posts picked for the previous page", () => {
    const container = mount(selected)

    pick(container, "i2")

    expect(form?.getValues("c.value.channelPostIds")).toEqual([])
    expect(form?.getValues("c.sourceId")).toBe("i2")
  })

  test("switching to any page keeps the picked posts", () => {
    const container = mount(selected)

    pick(container, "")

    expect(form?.getValues("c.value.channelPostIds")).toEqual(["9"])
  })

  test("re-picking the same page keeps the picked posts", () => {
    const container = mount(selected)

    pick(container, "i1")

    expect(form?.getValues("c.value.channelPostIds")).toEqual(["9"])
  })
})
