import type { LeaderboardPlatform } from "@chatbotx.io/database/partials"
import { LEADERBOARD_RULES_BY_PLATFORM } from "@chatbotx.io/database/partials"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

vi.mock("@/features/tags/provider/tag-hook", () => ({
  useTagSelectOptions: () => [],
}))
vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlowSelectOptions: () => [],
}))

const { buildLeaderboardMenu } = await import(
  "../src/features/leaderboards/lib/menu"
)
const { RulesEditor } = await import(
  "../src/features/leaderboards/components/wizard/rules-editor"
)
const { GeneralSettings } = await import(
  "../src/features/leaderboards/components/wizard/general-settings"
)
const { AdjustScoreDialog, canSubmitAdjustment } = await import(
  "../src/features/leaderboards/components/participants/adjust-score-dialog"
)

describe("buildLeaderboardMenu", () => {
  // The spec's status table (LEADERBOARD_ACTIONS_BY_STATUS).
  const ACTIONS_BY_STATUS = {
    draft: ["edit", "publish", "delete"],
    active: ["pause", "edit", "resetPoints", "finish", "export"],
    paused: ["start", "edit", "export", "delete"],
    finished: ["export", "triggerRewards", "delete"],
  } as const

  test.each(
    Object.entries(ACTIONS_BY_STATUS),
  )("%s shows exactly its allowed actions plus participants and public link", (_status, actions) => {
    const menu = buildLeaderboardMenu(actions)
    expect([...menu].sort()).toEqual(
      [...actions, "viewParticipants", "copyLink"].sort(),
    )
  })

  test("an active leaderboard has no delete; reset points only when active", () => {
    expect(buildLeaderboardMenu(ACTIONS_BY_STATUS.active)).not.toContain(
      "delete",
    )
    for (const status of ["draft", "paused", "finished"] as const) {
      expect(buildLeaderboardMenu(ACTIONS_BY_STATUS[status])).not.toContain(
        "resetPoints",
      )
    }
  })
})

describe("canSubmitAdjustment", () => {
  test("requires a non-zero whole number and a non-blank reason", () => {
    expect(canSubmitAdjustment("50", "")).toBe(false)
    expect(canSubmitAdjustment("50", "   ")).toBe(false)
    expect(canSubmitAdjustment("0", "bonus")).toBe(false)
    expect(canSubmitAdjustment("", "bonus")).toBe(false)
    expect(canSubmitAdjustment("1.5", "bonus")).toBe(false)
    expect(canSubmitAdjustment("-20", "spam")).toBe(true)
  })
})

describe("leaderboard admin UI", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
  })

  const withProviders = (children: ReactNode) => (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  )

  function FormHarness({
    platform,
    children,
  }: {
    platform: LeaderboardPlatform
    children: ReactNode
  }) {
    const form = useForm({
      defaultValues: {
        platform,
        rules: Object.fromEntries(
          LEADERBOARD_RULES_BY_PLATFORM[platform].map((key) => [
            key,
            { enabled: false, points: 0, maxPerDay: null },
          ]),
        ),
        resetTime: "22:00",
        tagIds: [],
        followersOnly: false,
        cooldownSeconds: 0,
      },
    })
    return <FormProvider {...form}>{children}</FormProvider>
  }

  const renderRules = (platform: LeaderboardPlatform) =>
    act(() => {
      root.render(
        withProviders(
          <FormHarness platform={platform}>
            <RulesEditor platform={platform} />
          </FormHarness>,
        ),
      )
    })

  test.each([
    "messenger",
    "instagram",
    "whatsapp",
    "zalo",
    "telegram",
    "email",
    "gamification",
  ] as const)("renders only the %s rules", (platform) => {
    renderRules(platform)
    const rendered = Array.from(container.querySelectorAll("[data-rule]")).map(
      (node) => node.getAttribute("data-rule"),
    )
    expect(rendered).toEqual([...LEADERBOARD_RULES_BY_PLATFORM[platform]])
  })

  test("email rules show the Email Topic tracking note", () => {
    renderRules("email")
    expect(container.textContent).toContain(
      messages.leaderboards.wizard.emailTopicNote,
    )
  })

  const renderGeneral = (platform: LeaderboardPlatform) =>
    act(() => {
      root.render(
        withProviders(
          <FormHarness platform={platform}>
            <GeneralSettings platform={platform} viewUrl={null} />
          </FormHarness>,
        ),
      )
    })

  test.each([
    ["instagram", true],
    ["zalo", true],
    ["telegram", true],
    ["messenger", false],
    ["whatsapp", false],
    ["email", false],
    ["gamification", false],
  ] as const)("followers-only on %s is shown: %s", (platform, shown) => {
    renderGeneral(platform)
    expect(
      container.textContent?.includes(
        messages.leaderboards.wizard.followersOnly,
      ),
    ).toBe(shown)
  })

  test("adjust points cannot be confirmed until a reason is entered", () => {
    act(() => {
      root.render(
        withProviders(
          <AdjustScoreDialog
            isPending={false}
            onConfirm={vi.fn()}
            onOpenChange={vi.fn()}
            open
            participantName="An"
          />,
        ),
      )
    })
    const confirm = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === messages.actions.confirm)
    expect(confirm).toBeDefined()
    expect(confirm?.disabled).toBe(true)
  })
})
