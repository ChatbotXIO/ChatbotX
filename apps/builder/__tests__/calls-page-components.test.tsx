// @vitest-environment node

import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { CallsEmptyState } from "@/features/whatsapp-calls/calls-empty-state"
import { CallsFilterBar } from "@/features/whatsapp-calls/calls-filter-bar"

const messages = {
  whatsapp: {
    calls: {
      page: {
        title: "Calls",
        emptyTitle: "No calls yet",
        emptyDescription:
          "Calls will show up here once your team starts making or receiving WhatsApp calls.",
        emptyFilteredTitle: "No calls match this filter",
        emptyFilteredDescription:
          "Try a different filter, or clear it to see every call.",
        allActivity: "All calls",
        filterMissed: "Missed",
        filterNoReply: "No reply",
      },
    },
  },
}

const SELECTED_MISSED_CHIP_RE = /aria-pressed="true"[^>]*>\s*Missed/

const renderWithIntl = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )

describe("CallsEmptyState (plan P5 test list: empty state)", () => {
  test("renders the unfiltered 'no calls yet' copy when hasActiveFilter is false", () => {
    const html = renderWithIntl(<CallsEmptyState hasActiveFilter={false} />)

    expect(html).toContain("No calls yet")
    expect(html).toContain(
      "Calls will show up here once your team starts making or receiving WhatsApp calls.",
    )
  })

  // L3: a filtered empty result is a distinct state from "no calls yet".
  test("renders the FILTERED empty copy (distinct from 'no calls yet') when hasActiveFilter is true", () => {
    const html = renderWithIntl(<CallsEmptyState hasActiveFilter={true} />)

    expect(html).toContain("No calls match this filter")
    expect(html).toContain(
      "Try a different filter, or clear it to see every call.",
    )
    expect(html).not.toContain("No calls yet")
  })
})

// Default filter-bar props for the chip-only assertions below — no
// inbox/agent options, so neither select renders (item 6 gap closure adds
// them, dedicated coverage lives in `calls-filter-bar-selects.test.tsx`).
const noSelectProps = {
  inboxId: undefined,
  onInboxChange: () => undefined,
  inboxOptions: [],
  agentUserId: undefined,
  onAgentChange: () => undefined,
  agentOptions: [],
  showAgentFilter: false,
}

describe("CallsFilterBar (plan D9: base chips Missed and No reply)", () => {
  test("renders exactly the three base chips: All calls, Missed, No reply", () => {
    const html = renderWithIntl(
      <CallsFilterBar
        activity={undefined}
        onActivityChange={() => undefined}
        {...noSelectProps}
      />,
    )

    expect(html).toContain("All calls")
    expect(html).toContain("Missed")
    expect(html).toContain("No reply")
  })

  test("marks the active chip pressed via aria-pressed", () => {
    const html = renderWithIntl(
      <CallsFilterBar
        activity="missed"
        onActivityChange={() => undefined}
        {...noSelectProps}
      />,
    )

    expect(html).toMatch(SELECTED_MISSED_CHIP_RE)
  })

  // L3: buttons, not a tablist/tab pair with no owning tabpanel.
  test("renders plain toggle buttons, not role=tab/tablist", () => {
    const html = renderWithIntl(
      <CallsFilterBar
        activity={undefined}
        onActivityChange={() => undefined}
        {...noSelectProps}
      />,
    )

    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('role="tab"')
  })
})
