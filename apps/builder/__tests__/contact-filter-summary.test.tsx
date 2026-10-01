// @vitest-environment jsdom

import { formFieldTypes } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { FieldConfig } from "@/features/contact-filter/components/contact-filter-config"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"

const { mockUseContactFilterConfigs } = vi.hoisted(() => ({
  mockUseContactFilterConfigs: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock(
  "@/features/contact-filter/components/use-contact-filter-configs",
  () => ({
    useContactFilterConfigs: mockUseContactFilterConfigs,
  }),
)

const { ContactFilterSummary } = await import(
  "@/features/contact-filter/components/contact-filter-summary"
)

const configs: FieldConfig[] = [
  {
    name: "tags",
    formField: formFieldTypes.enum.multiSelect,
    group: "analytics",
    options: [{ label: "VIP", value: "tag-1" }],
  },
  {
    name: "inbox",
    formField: formFieldTypes.enum.multiSelect,
    group: "contactInfo",
    options: [{ label: "Support Inbox", value: "inbox-1" }],
  },
  {
    name: "customField:cf-1",
    customFieldId: "cf-1",
    customFieldType: "shortText",
    label: "Loyalty Tier",
    formField: formFieldTypes.enum.text,
    group: "customFields",
  },
  {
    name: "conversationAssigned",
    formField: formFieldTypes.enum.multiSelect,
    group: "analytics",
    options: [
      { label: "Unassigned", value: "unassigned" },
      {
        label: "Agents",
        value: "agents",
        children: [{ label: "Alice", value: "u_1" }],
      },
      {
        label: "Inbox Teams",
        value: "inbox-teams",
        children: [{ label: "Sales Team", value: "t_1" }],
      },
    ],
  },
  {
    name: "blocked",
    formField: formFieldTypes.enum.boolean,
    group: "contactInfo",
    options: [
      { label: "fields.boolean.true", value: "true" },
      { label: "Translated false", value: "false" },
    ],
  },
]

const parseFilter = (conditions: unknown[], operator: "and" | "or" = "and") =>
  contactFilterCriteriaSchema.parse({ operator, conditions })

describe("ContactFilterSummary", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mockUseContactFilterConfigs.mockReturnValue({
      configs,
      conditionOptions: [],
      operatorLabelByValue: new Map([
        ["eq", "Is"],
        ["in", "Includes"],
      ]),
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  const renderSummary = (
    contactFilter: ReturnType<typeof parseFilter> | null | undefined,
  ) => {
    act(() => {
      root.render(
        <ContactFilterSummary
          contactFilter={contactFilter}
          inboxChannel="messenger"
        />,
      )
    })
    return container.textContent ?? ""
  }

  test("flags values missing from the looked-up labels as unknown", () => {
    mockUseContactFilterConfigs.mockReturnValue({
      configs: configs.map((config) =>
        config.name === "tags"
          ? { ...config, valueLabels: [{ label: "VIP", value: "tag-1" }] }
          : config,
      ),
      conditionOptions: [],
      operatorLabelByValue: new Map([["in", "Includes"]]),
    })
    const filter = parseFilter([
      { field: "tags", operator: "in", value: ["tag-1", "deleted"] },
    ])

    const text = renderSummary(filter)

    expect(text).toContain("VIP, condition.unknownValue")
    // The filter is handed to the hook so it can look its ids up.
    expect(mockUseContactFilterConfigs).toHaveBeenCalledWith(
      "messenger",
      false,
      filter.conditions,
    )
  })

  test("resolves option labels, dynamic field names, and operator labels", async () => {
    const text = await renderSummary(
      parseFilter([
        { field: "tags", operator: "in", value: ["tag-1", "missing"] },
        { field: "inbox", operator: "in", value: ["inbox-1"] },
        {
          field: "customField",
          customFieldId: "cf-1",
          customFieldType: "shortText",
          valueType: "text",
          operator: "eq",
          value: "gold",
        },
      ]),
    )

    expect(text).toContain("VIP, missing")
    expect(text).toContain("Support Inbox")
    expect(text).toContain("Loyalty Tier")
    expect(text).toContain("Includes")
    expect(text).toContain("Is")
    expect(mockUseContactFilterConfigs).toHaveBeenCalledWith(
      "messenger",
      false,
      expect.any(Array),
    )
  })

  test("resolves nested assignee options and top-level unassigned", async () => {
    const text = await renderSummary(
      parseFilter([
        {
          field: "conversationAssigned",
          operator: "in",
          value: ["u_1", "t_1", "unassigned"],
        },
      ]),
    )

    expect(text).toContain("Alice, Sales Team, Unassigned")
  })

  test("renders translated boolean labels", async () => {
    const text = await renderSummary(
      parseFilter([{ field: "blocked", operator: "eq", value: "false" }]),
    )

    expect(text).toContain("Translated false")
  })

  test("renders the empty state without loading configs for null and empty filters", async () => {
    expect(await renderSummary(null)).toContain(
      "broadcasts.detail.noAudienceFilter",
    )
    expect(await renderSummary(parseFilter([]))).toContain(
      "broadcasts.detail.noAudienceFilter",
    )
    expect(mockUseContactFilterConfigs).not.toHaveBeenCalled()
  })

  test("keeps ctwa retarget rendering unchanged", async () => {
    const text = await renderSummary(
      parseFilter(
        [
          {
            field: "ctwaRetarget",
            segment: "leads",
            adId: "ad-1",
            since: "2026-09-01",
            until: "2026-09-07",
          },
        ],
        "or",
      ),
    )

    expect(text).toContain("condition.operator.or")
    expect(text).toContain("condition.ctwaRetarget.segments.leads")
    expect(text).toContain("condition.ctwaRetarget.adPrefix ad-1")
    expect(text).toContain("2026-09-01–2026-09-07")
  })
})
