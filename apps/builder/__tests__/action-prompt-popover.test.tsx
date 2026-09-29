import { DEFAULT_AI_AGENT_ACTION_PROMPT } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useController, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ActionPromptPopover } from "@/features/ai-agents/components/action-prompt-popover"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@chatbotx.io/ui/components/form/textarea-field", () => ({
  TextareaField: ({
    className,
    name,
    ...props
  }: {
    className?: string
    name: string
  }) => {
    const { field } = useController({ name })
    return <textarea {...field} {...props} className={className} />
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ render }: { render: React.ReactNode }) => <>{render}</>,
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ render }: { render: React.ReactNode }) => <>{render}</>,
}))

describe("ActionPromptPopover", () => {
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

  test("resets the prompt to the platform default and uses a tall textarea", () => {
    let getActionPrompt: () => string | null = () => null

    function Form() {
      const form = useForm({ defaultValues: { actionPrompt: "Custom prompt" } })
      getActionPrompt = () => form.getValues("actionPrompt")
      return (
        <FormProvider {...form}>
          <ActionPromptPopover />
        </FormProvider>
      )
    }

    act(() => root.render(<Form />))

    const prompt = container.querySelector("textarea")
    expect(prompt?.className).toContain("min-h-72")

    const reset = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "actionPrompt.reset",
    )
    act(() => reset?.click())

    expect(getActionPrompt()).toBe(DEFAULT_AI_AGENT_ACTION_PROMPT)
  })
})
