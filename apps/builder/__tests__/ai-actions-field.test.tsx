import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  FormProvider,
  type UseFormReturn,
  useController,
  useForm,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  AIActionsField,
  normalizeAIAgentActionRulesForForm,
} from "@/features/ai-agents/components/ai-actions-field"
import type { CreateAIAgentRequest } from "@/features/ai-agents/schema/action"

vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      if (key === "condition.valuePlaceholder") {
        return "..."
      }
      return values?.number === undefined ? key : `${key}:${values.number}`
    },
}))

vi.mock("@chatbotx.io/ui/components/form/input-field", () => ({
  InputField: ({ name, ...props }: { name: string }) => {
    const { field } = useController({ name })
    return <input {...field} {...props} />
  },
}))

vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({
    name,
    options = [],
    onValueChange,
    ...props
  }: {
    name: string
    options?: Array<{ label: string; value: string }>
    onValueChange?: (value: string) => void
  }) => {
    const { field } = useController({ name })
    return (
      <select
        {...field}
        {...props}
        onChange={(event) => {
          onValueChange?.(event.target.value)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: ({
    name,
    options = [],
    ...props
  }: {
    name: string
    options?: Array<{
      children?: Array<{ label: string; value: string }>
      label: string
      value: string
    }>
  }) => {
    const { field } = useController({ name })
    return (
      <select {...field} {...props}>
        {options.map((option) =>
          option.children ? (
            <optgroup key={option.value} label={option.label}>
              {option.children.map((child) => (
                <option key={child.value} value={child.value}>
                  {child.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ),
        )}
      </select>
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("@/features/ai-agents/components/action-prompt-popover", () => ({
  ActionPromptPopover: () => null,
}))

describe("AIActionsField", () => {
  let container: HTMLDivElement
  let form: UseFormReturn<CreateAIAgentRequest>
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

  function TestForm() {
    form = useForm<CreateAIAgentRequest>({
      defaultValues: {
        actionRules: [
          {
            id: "rule-1",
            when: "Customer asks for a demo",
            actions: [{ id: "action-1", type: "send_flow", flowId: "flow-1" }],
          },
        ],
      },
    })

    return (
      <FormProvider {...form}>
        <AIActionsField
          options={{
            admins: [{ label: "Avery", value: "admin-1" }],
            customFields: [],
            flows: [{ label: "Demo", value: "flow-1" }],
            inboxTeams: [{ label: "Support", value: "team-1" }],
            tags: [{ label: "Qualified", value: "tag-1" }],
          }}
        />
      </FormProvider>
    )
  }

  test("replaces an action with the selected type and its matching fields", () => {
    act(() => root.render(<TestForm />))

    const actionType = container.querySelector<HTMLSelectElement>(
      '[aria-label="actionType"]',
    )
    expect(actionType?.value).toBe("send_flow")
    act(() => {
      form.setError("actionRules.0.actions.0.type", {
        message: 'Invalid input: expected "send_flow"',
      })
    })

    act(() => {
      if (!actionType) {
        throw new Error("Action type selector was not rendered")
      }
      actionType.value = "add_tag"
      actionType.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(actionType?.value).toBe("add_tag")
    expect(form.getValues("actionRules.0.actions.0")).toMatchObject({
      type: "add_tag",
      tagId: "",
    })
    expect(form.getValues("actionRules.0.actions.0")).not.toHaveProperty(
      "flowId",
    )
    expect(
      form.getFieldState("actionRules.0.actions.0.type").error,
    ).toBeUndefined()
  })

  test("groups administrator and Inbox Team assignment targets", () => {
    act(() => root.render(<TestForm />))

    const actionType = container.querySelector<HTMLSelectElement>(
      '[aria-label="actionType"]',
    )
    act(() => {
      if (!actionType) {
        throw new Error("Action type selector was not rendered")
      }
      actionType.value = "assign_conversation"
      actionType.dispatchEvent(new Event("change", { bubbles: true }))
    })

    const assignee = container.querySelector<HTMLSelectElement>(
      'select[name="actionRules.0.actions.0.assignedId"]',
    )
    expect(assignee?.querySelector("optgroup[label='admins.title']")).not.toBe(
      null,
    )
    expect(
      assignee?.querySelector("optgroup[label='inboxTeams.title']"),
    ).not.toBe(null)

    act(() => {
      if (!assignee) {
        throw new Error("Assignee selector was not rendered")
      }
      assignee.value = "t_team-1"
      assignee.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(form.getValues("actionRules.0.actions.0")).toMatchObject({
      type: "assign_conversation",
      assignedId: "t_team-1",
    })
  })

  test("uses the When value as the collapsible rule title", () => {
    act(() => root.render(<TestForm />))

    const trigger = container.querySelector<HTMLElement>(
      '[data-testid="ai-action-rule-trigger-0"]',
    )
    expect(trigger?.textContent).toContain("Customer asks for a demo")

    act(() => {
      form.setValue("actionRules.0.when", "")
    })
    expect(trigger?.textContent).toContain("...")

    act(() => {
      form.setValue("actionRules.0.when", "Customer asks for a refund")
    })
    expect(trigger?.textContent).toContain("Customer asks for a refund")
  })

  test("opens only the newly added rule", () => {
    act(() => root.render(<TestForm />))

    const addRule = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "+ addRule",
    )
    act(() => addRule?.click())

    expect(
      container.querySelector('input[name="actionRules.0.when"]'),
    ).toBeNull()
    expect(
      container.querySelector('input[name="actionRules.1.when"]'),
    ).not.toBeNull()
  })

  test("normalizes stored legacy administrator assignments for the grouped selector", () => {
    expect(
      normalizeAIAgentActionRulesForForm([
        {
          id: "rule-1",
          when: "Customer asks for a person",
          actions: [
            {
              id: "assignment-1",
              type: "assign_conversation",
              adminId: "admin-1",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "rule-1",
        when: "Customer asks for a person",
        actions: [
          {
            id: "assignment-1",
            type: "assign_conversation",
            assignedId: "u_admin-1",
          },
        ],
      },
    ])
  })
})
