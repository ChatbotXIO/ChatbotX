// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createAdsConversionRuleAction } from "@/features/ads/actions/conversion-rule"
import { ConversionEventsView } from "@/features/ads/components/conversion-events-view"
import type { ConversionEventsData } from "@/features/ads/queries/conversion-rules"
import type { AdsSwitcherIntegration } from "@/features/ads/queries/switcher"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: (...args: unknown[]) => unknown) => ({
    execute: (...args: unknown[]) => action(...args),
    isPending: false,
  }),
}))

vi.mock("@/features/ads/actions/conversion-rule", () => ({
  createAdsConversionRuleAction: vi.fn(),
  deleteAdsConversionRuleAction: vi.fn(),
  toggleAdsConversionRuleAction: vi.fn(),
}))

vi.mock("@chatbotx.io/ui/components/ui/sersavan/multi-select", () => ({
  MultiSelect: ({
    onValueChange,
    placeholder,
  }: {
    defaultValue: string[]
    onValueChange: (value: string[]) => void
    placeholder?: string
  }) => (
    <button onClick={() => onValueChange(["option-1"])} type="button">
      multi-select:{placeholder}
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean
    onCheckedChange?: (value: boolean) => void
  }) => (
    <button
      data-checked={checked}
      data-slot="checkbox"
      onClick={() => onCheckedChange?.(!checked)}
      type="button"
    >
      checkbox
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => children,
  TabsContent: ({ children }: { children: ReactNode }) => children,
  TabsList: ({ children }: { children: ReactNode }) => children,
  TabsTrigger: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/features/ads/components/ads-account-control", () => ({
  AdsAccountControl: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    children,
    items,
    onValueChange,
  }: {
    children: ReactNode
    items?: { label: string; value: string }[]
    onValueChange?: (value: string) => void
  }) => (
    <div>
      {children}
      {items?.map((item) => (
        <button
          key={item.value}
          onClick={() => onValueChange?.(item.value)}
          type="button"
        >
          select-when:{item.value}
        </button>
      ))}
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}))

const data = {
  whatsappIntegrations: [
    {
      id: "iw-1",
      name: "Primary",
      inboxId: "inbox-1",
      displayPhoneNumber: "+12025550101",
      phoneNumberId: "phone-1",
      wabaId: "waba-1",
      hasCapiScope: true,
      capiScopeCheckedAt: null,
      datasetId: null,
    },
    {
      id: "iw-2",
      name: "Secondary",
      inboxId: "inbox-2",
      displayPhoneNumber: "+12025550102",
      phoneNumberId: "phone-2",
      wabaId: "waba-2",
      hasCapiScope: true,
      capiScopeCheckedAt: null,
      datasetId: null,
    },
  ],
  whatsappTemplates: [
    {
      id: "template-1",
      name: "Template 1",
      language: "en",
      integrationWhatsappId: "iw-1",
    },
  ],
  rules: [
    {
      id: "rule-1",
      integrationWhatsappId: "iw-1",
      eventType: "lead",
      enabled: true,
      trigger: { type: "templateSent", templateIds: ["template-1"] },
    },
    {
      id: "rule-2",
      integrationWhatsappId: "iw-1",
      eventType: "purchase",
      enabled: true,
      trigger: { type: "templateSent", templateIds: ["template-1"] },
    },
    {
      id: "rule-3",
      integrationWhatsappId: "iw-1",
      eventType: "lead",
      enabled: true,
      trigger: { type: "tagApplied", tagIds: ["tag-1"] },
    },
    {
      id: "rule-4",
      integrationWhatsappId: "iw-1",
      eventType: "lead",
      enabled: true,
      trigger: { type: "keywordMatched", automatedResponseIds: ["ar-1"] },
    },
    {
      id: "rule-5",
      integrationWhatsappId: "iw-1",
      eventType: "lead",
      enabled: true,
      trigger: { type: "contactReplied", firstReplyOnly: true },
    },
  ],
  tags: [{ id: "tag-1", name: "VIP" }],
  automatedResponses: [{ id: "ar-1", keywords: ["hello", "hi"] }],
} as unknown as ConversionEventsData

// The account switcher pulls from a separate, richer query in production
// (getAdsSwitcherData); the fixture above intentionally carries the extra
// fields so it can double as that data source here.
const switcherIntegrations =
  data.whatsappIntegrations as unknown as AdsSwitcherIntegration[]

describe("ConversionEventsView rule types", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  test("renders lead and purchase WhatsApp rule builders", async () => {
    await act(async () => {
      root.render(
        <ConversionEventsView
          promises={Promise.resolve([data])}
          selectedAccount={data.whatsappIntegrations[0]}
          switcherIntegrations={switcherIntegrations}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "ads.conversionEvents.trackQualifiedLeads.title",
    )
    expect(container.textContent).toContain(
      "ads.conversionEvents.trackPurchases.title",
    )
    expect(container.textContent).toContain(
      "ads.conversionEvents.trackPurchases.noValueNote",
    )
    expect(container.textContent).toContain(
      "ads.conversionEvents.eventTypeLead",
    )
    expect(container.textContent).toContain(
      "ads.conversionEvents.eventTypePurchase",
    )
  })

  test("renders existing rules for every trigger type via describeTrigger helpers", async () => {
    await act(async () => {
      root.render(
        <ConversionEventsView
          promises={Promise.resolve([data])}
          selectedAccount={data.whatsappIntegrations[0]}
          switcherIntegrations={switcherIntegrations}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
      await Promise.resolve()
    })

    // tagApplied rule: label + resolved tag name
    expect(container.textContent).toContain(
      "ads.conversionEvents.whenOptions.tagApplied",
    )
    expect(container.textContent).toContain("VIP")

    // keywordMatched rule: label + resolved keyword rule label
    expect(container.textContent).toContain(
      "ads.conversionEvents.whenOptions.keywordMatched",
    )
    expect(container.textContent).toContain("hello, hi")

    // contactReplied rule with firstReplyOnly: true → the "first message" label
    expect(container.textContent).toContain(
      "ads.conversionEvents.qualifyingFirstReply",
    )
  })

  test("renders the trigger type picker with all four options", async () => {
    await act(async () => {
      root.render(
        <ConversionEventsView
          promises={Promise.resolve([data])}
          selectedAccount={data.whatsappIntegrations[0]}
          switcherIntegrations={switcherIntegrations}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
      await Promise.resolve()
    })

    for (const key of [
      "templateSent",
      "tagApplied",
      "keywordMatched",
      "contactReplied",
    ]) {
      expect(container.textContent).toContain(
        `ads.conversionEvents.whenOptions.${key}`,
      )
    }
  })

  test.each([
    {
      whenValue: "tagApplied",
      expectedTrigger: { type: "tagApplied", tagIds: ["option-1"] },
    },
    {
      whenValue: "keywordMatched",
      expectedTrigger: {
        type: "keywordMatched",
        automatedResponseIds: ["option-1"],
      },
    },
  ])("submits a $whenValue trigger rule on Save", async ({
    whenValue,
    expectedTrigger,
  }) => {
    vi.mocked(createAdsConversionRuleAction).mockClear()

    await act(async () => {
      root.render(
        <ConversionEventsView
          promises={Promise.resolve([data])}
          selectedAccount={data.whatsappIntegrations[0]}
          switcherIntegrations={switcherIntegrations}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
      await Promise.resolve()
    })

    const findButton = (text: string) =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes(text),
      )

    await act(async () => {
      findButton(`select-when:${whenValue}`)?.click()
      await Promise.resolve()
    })

    await act(async () => {
      findButton("multi-select:")?.click()
      await Promise.resolve()
    })

    await act(async () => {
      findButton("actions.save")?.click()
      await Promise.resolve()
    })

    expect(createAdsConversionRuleAction).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ trigger: expectedTrigger }),
    )
  })

  test("submits a contactReplied trigger rule with firstReplyOnly toggled on Save", async () => {
    vi.mocked(createAdsConversionRuleAction).mockClear()

    await act(async () => {
      root.render(
        <ConversionEventsView
          promises={Promise.resolve([data])}
          selectedAccount={data.whatsappIntegrations[0]}
          switcherIntegrations={switcherIntegrations}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
      await Promise.resolve()
    })

    const findButton = (text: string) =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes(text),
      )

    await act(async () => {
      findButton("select-when:contactReplied")?.click()
      await Promise.resolve()
    })

    const checkbox = container.querySelector(
      '[data-slot="checkbox"]',
    ) as HTMLButtonElement | null
    await act(async () => {
      checkbox?.click()
      await Promise.resolve()
    })

    await act(async () => {
      findButton("actions.save")?.click()
      await Promise.resolve()
    })

    expect(createAdsConversionRuleAction).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        trigger: { type: "contactReplied", firstReplyOnly: true },
      }),
    )
  })
})
