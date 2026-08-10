// @vitest-environment node

import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { UsageBars, type UsageMetric } from "../usage-bars"

// renderToStaticMarkup mirrors what the server emits during SSR, matching the
// pattern in `oss/apps/builder/__tests__/usage-number-formatting.test.tsx` —
// UsageBars calls `useFormatter()`, which needs a next-intl provider.
const renderWithLocale = (locale: string, node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} onError={() => undefined}>
      {node}
    </NextIntlClientProvider>,
  )

describe("UsageBars", () => {
  test("formats numbers with the provided locale", () => {
    const metrics: UsageMetric[] = [
      { key: "mac", label: "MAC", used: 5678, limit: 100_000 },
    ]

    const viHtml = renderWithLocale("vi", <UsageBars metrics={metrics} />)
    expect(viHtml).toContain("5.678")
    expect(viHtml).toContain("100.000")

    const enHtml = renderWithLocale("en", <UsageBars metrics={metrics} />)
    expect(enHtml).toContain("5,678")
    expect(enHtml).toContain("100,000")
  })

  test("renders no progress bar when limit is null", () => {
    const metrics: UsageMetric[] = [
      { key: "contacts", label: "Contacts", used: 42, limit: null },
    ]

    const html = renderWithLocale("en", <UsageBars metrics={metrics} />)
    expect(html).toContain("Contacts")
    expect(html).toContain("42")
    expect(html).not.toContain('role="progressbar"')
  })

  test("marks usage at the limit as over-limit", () => {
    const metrics: UsageMetric[] = [
      { key: "mac", label: "MAC", used: 100, limit: 100 },
    ]

    const html = renderWithLocale("en", <UsageBars metrics={metrics} />)
    expect(html).toContain("text-destructive")
  })

  test("renders the workspace-scoped segment when workspaceUsed is present", () => {
    const metrics: UsageMetric[] = [
      { key: "mac", label: "MAC", used: 500, limit: 1000, workspaceUsed: 120 },
    ]

    const html = renderWithLocale("en", <UsageBars metrics={metrics} />)
    expect(html).toContain("120")
    expect(html).toContain("500")
    expect(html).toContain("1,000")
  })
})
