// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ConversionEventsView } from "@/features/ads/components/conversion-events-view"
import type { ConversionEventsData } from "@/features/ads/queries/conversion-rules"
import type { AdsSwitcherIntegration } from "@/features/ads/queries/switcher"

const multiSelectSnapshots: string[][] = []

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))

vi.mock("@/features/ads/actions/conversion-rule", () => ({
  createAdsConversionRuleAction: vi.fn(),
  deleteAdsConversionRuleAction: vi.fn(),
  toggleAdsConversionRuleAction: vi.fn(),
}))

vi.mock("@chatbotx.io/ui/components/ui/sersavan/multi-select", () => ({
  MultiSelect: ({
    defaultValue,
    onValueChange,
  }: {
    defaultValue: string[]
    onValueChange: (value: string[]) => void
  }) => {
    multiSelectSnapshots.push(defaultValue)
    return (
      <button onClick={() => onValueChange(["template-1"])} type="button">
        multi-select
      </button>
    )
  },
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
  Select: ({ children }: { children: ReactNode }) => children,
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
  rules: [],
  tags: [],
  automatedResponses: [],
} as unknown as ConversionEventsData

// The account switcher pulls from a separate, richer query in production
// (getAdsSwitcherData); the fixture above intentionally carries the extra
// fields so it can double as that data source here.
const switcherIntegrations =
  data.whatsappIntegrations as unknown as AdsSwitcherIntegration[]

describe("ConversionEventsView account selection", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    multiSelectSnapshots.length = 0
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

  test("clears selected template ids when the selected account changes", async () => {
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

    act(() => {
      const multiSelectButton = Array.from(
        container.querySelectorAll("button"),
      ).find((button) => button.textContent === "multi-select")
      multiSelectButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    expect(multiSelectSnapshots.at(-1)).toEqual(["template-1"])

    await act(async () => {
      root.render(
        <ConversionEventsView
          promises={Promise.resolve([data])}
          selectedAccount={data.whatsappIntegrations[1]}
          switcherIntegrations={switcherIntegrations}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
      await Promise.resolve()
    })

    expect(multiSelectSnapshots.at(-1)).toEqual([])
  })
})
