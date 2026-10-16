// @vitest-environment jsdom

import type { DecisionProfileModel } from "@chatbotx.io/database/types"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { decisionProfileFormSchema } from "../../schema/form"
import { normalizeDecisionProfileForm, ProfileEditor } from "../profile-editor"

const actionMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  useAction: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: actionMocks.useAction,
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      agents: [],
      customFields: [],
      flows: [
        { id: "101", name: "AI" },
        { id: "102", name: "General support" },
      ],
      teams: [{ id: "104", name: "Support Team" }],
      users: [{ id: "103", name: "Demo ChatbotX" }],
    },
  }),
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "1",
}))

vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: ({ label, name }: { label?: string; name: string }) => (
    <input aria-label={label} name={name} />
  ),
}))

vi.mock("@/features/custom-fields/create-custom-field", () => ({
  CreateCustomFieldDialog: () => null,
}))

vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useCustomFields: () => ({ data: [] }),
  useInvalidateCustomFields: () => vi.fn(),
}))

vi.mock("../../actions/create-decision-profile.action", () => ({
  createDecisionProfileAction: vi.fn(),
}))

vi.mock("../../actions/update-decision-profile.action", () => ({
  updateDecisionProfileAction: vi.fn(),
}))

vi.mock("../../hooks/use-decision-profiles", () => ({
  useInvalidateDecisionProfiles: () => vi.fn(),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  actionMocks.execute.mockReset()
  actionMocks.useAction.mockReturnValue({
    execute: actionMocks.execute,
    isPending: false,
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("ProfileEditor", () => {
  test("removes incomplete optional Global Router mappings before saving", () => {
    const normalized = normalizeDecisionProfileForm({
      connectionId: "1",
      decision: {
        instructions: "Classify the current intent.",
        options: [
          { description: "Customer wants to buy.", value: "purchase" },
          { description: "No other intent matches.", value: "other" },
        ],
        type: "choice",
      },
      description: null,
      globalRouterConfig: {
        fallback: { id: "101", type: "flow" },
        metadataMappings: [
          {
            customFieldId: "",
            customFieldType: "shortText",
            value: "choice",
          },
        ],
        noul: { falseMaximum: 0.5, trueMinimum: 0.5 },
        routes: [],
        version: 1,
      },
      globalRouterEnabled: true,
      model: "jev-1.13.0",
      name: "Customer intent",
      status: "enabled",
      thresholdConfig: null,
    })

    expect(normalized.globalRouterConfig?.metadataMappings).toEqual([])
    expect(decisionProfileFormSchema.safeParse(normalized).success).toBe(true)
  })

  test("defaults an unchanged Global Router fallback type to Send Flow", () => {
    const normalized = normalizeDecisionProfileForm({
      connectionId: "1",
      decision: {
        instructions: "Classify the current intent.",
        options: [
          { description: "Customer wants to buy.", value: "purchase" },
          { description: "No other intent matches.", value: "other" },
        ],
        type: "choice",
      },
      description: null,
      globalRouterConfig: {
        fallback: { id: "101" } as never,
        metadataMappings: [],
        noul: { falseMaximum: 0.5, trueMinimum: 0.5 },
        routes: [],
        version: 1,
      },
      globalRouterEnabled: true,
      model: "jev-1.13.0",
      name: "Customer intent",
      status: "enabled",
      thresholdConfig: null,
    })

    expect(normalized.globalRouterConfig?.fallback).toEqual({
      id: "101",
      type: "flow",
    })
    expect(decisionProfileFormSchema.safeParse(normalized).success).toBe(true)
  })

  test("renders each Choice criterion validation error only once on submit", async () => {
    act(() => {
      root.render(
        <ProfileEditor
          connections={[
            {
              credentialConfigured: true,
              defaultModel: "jev-1.13.0",
              endpoint: null,
              id: "1",
              lastTest: { status: null, testedAt: null },
              modelCatalog: ["jev-1.13.0"],
              name: "TS",
              providerKind: "typesafe",
              status: "enabled",
            },
          ]}
          onClose={vi.fn()}
        />,
      )
    })

    expect(container.textContent).not.toContain(
      "decision.globalRouterDefaultDestination",
    )

    act(() => {
      const saveButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "actions.save",
      )
      if (!saveButton) {
        throw new Error("Save button was not rendered")
      }
      saveButton.click()
    })

    await vi.waitFor(() => {
      expect(
        container.querySelectorAll('[data-slot="nested-field-error"]'),
      ).toHaveLength(4)
    })
    expect(
      container.querySelectorAll('[data-slot="form-message"]'),
    ).toHaveLength(0)
    expect(actionMocks.execute).not.toHaveBeenCalled()
  })

  test("clears the prior Decision branch validation when changing type", () => {
    act(() => {
      root.render(
        <ProfileEditor
          connections={[
            {
              credentialConfigured: true,
              defaultModel: "jev-1.13.0",
              endpoint: null,
              id: "1",
              lastTest: { status: null, testedAt: null },
              modelCatalog: ["jev-1.13.0"],
              name: "TS",
              providerKind: "typesafe",
              status: "enabled",
            },
          ]}
          onClose={vi.fn()}
        />,
      )
    })

    act(() => {
      const scoreType =
        container.querySelector<HTMLInputElement>('[value="score"]')
      if (!scoreType) {
        throw new Error("Score type control was not rendered")
      }
      scoreType.click()
    })

    expect(
      container.querySelectorAll(
        'textarea[name^="decision.levels."][name$=".description"]',
      ),
    ).toHaveLength(5)
    expect(
      container.querySelectorAll('[data-slot="form-message"]'),
    ).toHaveLength(0)
  })

  test("calls the save action when a Choice profile is complete", async () => {
    const safeParse = vi.spyOn(decisionProfileFormSchema, "safeParse")
    act(() => {
      root.render(
        <ProfileEditor
          connections={[
            {
              credentialConfigured: true,
              defaultModel: "jev-1.13.0",
              endpoint: null,
              id: "1",
              lastTest: { status: null, testedAt: null },
              modelCatalog: ["jev-1.13.0"],
              name: "TS",
              providerKind: "typesafe",
              status: "enabled",
            },
          ]}
          onClose={vi.fn()}
          profile={
            {
              connectionId: "1",
              contract: {
                inputs: [{ key: "currentMessage", required: true }],
                questions: [
                  {
                    instructions: "Classify the current intent.",
                    key: "result",
                    label: "Customer intent",
                    options: [
                      {
                        description: "Customer wants to buy.",
                        label: "Purchase",
                        value: "purchase",
                      },
                      {
                        description: "No other intent matches.",
                        label: "Other",
                        value: "other",
                      },
                    ],
                    type: "choice",
                  },
                ],
              },
              createdAt: new Date(),
              description: null,
              globalRouterConfig: null,
              globalRouterEnabled: false,
              id: "2",
              model: "jev-1.13.0",
              name: "Customer intent",
              status: "enabled",
              thresholdConfig: null,
              updatedAt: new Date(),
              workspaceId: "1",
            } as DecisionProfileModel
          }
        />,
      )
    })

    act(() => {
      const saveButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "actions.save",
      )
      if (!saveButton) {
        throw new Error("Save button was not rendered")
      }
      saveButton.click()
    })

    await vi.waitFor(() => {
      expect(safeParse).toHaveReturnedWith(
        expect.objectContaining({ success: true }),
      )
      expect(actionMocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.objectContaining({ type: "choice" }),
          name: "Customer intent",
        }),
      )
    })
  })

  test("keeps an unavailable Global Router editable and submits its configuration", async () => {
    act(() => {
      root.render(
        <ProfileEditor
          connections={[
            {
              credentialConfigured: true,
              defaultModel: "jev-1.13.0",
              endpoint: null,
              id: "1",
              lastTest: { status: null, testedAt: null },
              modelCatalog: [],
              name: "TS",
              providerKind: "typesafe",
              status: "disabled",
            },
          ]}
          onClose={vi.fn()}
          profile={
            {
              connectionId: "1",
              contract: {
                inputs: [{ key: "currentMessage", required: true }],
                questions: [
                  {
                    instructions: "Classify the current intent.",
                    key: "result",
                    label: "Customer intent",
                    options: [
                      {
                        description: "Customer wants to buy.",
                        label: "Purchase",
                        value: "purchase",
                      },
                      {
                        description: "No other intent matches.",
                        label: "Other",
                        value: "other",
                      },
                    ],
                    type: "choice",
                  },
                ],
              },
              createdAt: new Date(),
              description: null,
              globalRouterConfig: {
                fallback: { id: "103", type: "user" },
                metadataMappings: [],
                noul: { falseMaximum: 0.5, trueMinimum: 0.5 },
                routes: [
                  {
                    destination: { id: "104", type: "team" },
                    type: "choice",
                    value: "purchase",
                  },
                ],
                version: 1,
              },
              globalRouterEnabled: true,
              id: "2",
              model: "jev-1.13.0",
              name: "Customer intent",
              status: "enabled",
              thresholdConfig: null,
              updatedAt: new Date(),
              workspaceId: "1",
            } as DecisionProfileModel
          }
        />,
      )
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain("decision.globalRouterRoutes")
    })
    const headings = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent,
    )
    expect(
      headings.indexOf("decision.globalRouterDefaultDestination"),
    ).toBeGreaterThan(headings.indexOf("decision.thresholds"))
    expect(headings.indexOf("decision.globalRouterRoutes")).toBeGreaterThan(
      headings.indexOf("decision.globalRouterDefaultDestination"),
    )
    expect(container.textContent).toContain("purchase")
    expect(container.textContent).toContain("other")
    expect(container.textContent).toContain("decision.globalRouterUsesFallback")
    expect(container.textContent).toContain("decision.connectionUnavailable")
    expect(container.textContent).toContain("decision.modelUnavailable")
    expect(container.textContent).toContain("assignConversation")
    expect(container.textContent).toContain("fields.assignedId.label")
    expect(container.textContent).toContain("Demo ChatbotX")
    expect(container.textContent).toContain("Support Team")

    act(() => {
      const saveButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "actions.save",
      )
      if (!saveButton) {
        throw new Error("Save button was not rendered")
      }
      saveButton.click()
    })

    await vi.waitFor(() => {
      expect(actionMocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          globalRouterConfig: expect.objectContaining({
            fallback: { id: "103", type: "user" },
          }),
          globalRouterEnabled: true,
        }),
      )
    })

    const assignmentPicker = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (button) =>
        button.getAttribute("aria-label") === "fields.assignedId.label",
    )
    if (!assignmentPicker) {
      throw new Error("Assignment picker was not rendered")
    }
    act(() => assignmentPicker.click())

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("admins.title")
      expect(document.body.textContent).toContain("inboxTeams.title")
    })
  })
})
