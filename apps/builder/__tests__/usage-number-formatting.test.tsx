// @vitest-environment node

import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { UsageBars } from "@/components/usage-bars"
import { UsageRing } from "@/components/usage-ring"
import type { QuotaMetricKey } from "@/lib/quota-metrics"

const LABELS: Record<QuotaMetricKey, string> = {
  contacts: "Contacts",
  mac: "Monthly active contacts",
  botMessages: "Bot messages",
  monthlyBotMessages: "Monthly bot messages",
  workspaces: "Workspaces",
  channels: "Channels",
  teamMembers: "Team members",
}

// renderToStaticMarkup mirrors what the server emits during SSR, so these
// assertions prove the output depends on the next-intl locale rather than the
// runtime's default locale — the invariant that prevents React #418
// hydration text mismatches.
const renderWithLocale = (locale: string, node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} onError={() => undefined}>
      {node}
    </NextIntlClientProvider>,
  )

describe("usage number formatting", () => {
  test("UsageRing renders label with compact usage value", () => {
    const html = renderWithLocale(
      "en",
      <UsageRing label="MAC" limit={10_000} used={1234} workspaceUsed={456} />,
    )

    expect(html).toContain("MAC")
    expect(html).toContain("456")
    expect(html).toContain("10K")
    expect(html).not.toContain("1,234")
    expect(html).not.toContain("10,000")
  })

  test("UsageRing formats compact values across boundary cases", () => {
    const cases: [number, number, string, string][] = [
      [999, 10_000, "999", "10K"],
      [1000, 10_000, "1K", "10K"],
      [1500, 10_000, "1.5K", "10K"],
      [3_000_000, 5_000_000, "3M", "5M"],
    ]

    for (const [workspaceUsed, limit, expectedUsed, expectedLimit] of cases) {
      const html = renderWithLocale(
        "en",
        <UsageRing
          label="MAC"
          limit={limit}
          used={workspaceUsed}
          workspaceUsed={workspaceUsed}
        />,
      )
      expect(html).toContain(expectedUsed)
      expect(html).toContain(expectedLimit)
    }
  })

  test("UsageRing renders nested workspace and user fill widths", () => {
    const html = renderWithLocale(
      "en",
      <UsageRing label="MAC" limit={100} used={60} workspaceUsed={25} />,
    )

    expect(html).toContain("bg-amber-500")
    expect(html).toContain("bg-emerald-500")
    expect(html).toContain('style="width:60%"')
    expect(html).toContain('style="width:25%"')
  })

  test("UsageBars formats numbers with the app locale", () => {
    const metrics = [{ key: "mac" as const, used: 5678, limit: 100_000 }]

    const viHtml = renderWithLocale(
      "vi",
      <UsageBars labels={LABELS} metrics={metrics} />,
    )
    expect(viHtml).toContain("5.678")
    expect(viHtml).toContain("100.000")

    const enHtml = renderWithLocale(
      "en",
      <UsageBars labels={LABELS} metrics={metrics} />,
    )
    expect(enHtml).toContain("5,678")
    expect(enHtml).toContain("100,000")
  })
})
