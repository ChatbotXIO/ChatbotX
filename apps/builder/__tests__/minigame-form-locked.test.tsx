// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  getDefaultMinigameAppearance,
  getDefaultMinigameGeneralSettings,
  getDefaultMinigameNonWinningMessageSettings,
  getDefaultMinigamePlayerSettings,
  getDefaultMinigamePrizeSettings,
  getDefaultMinigameWinningMessageSettings,
} from "@/features/minigames/constants"
import { MinigameForm } from "@/features/minigames/minigame-form"
import type { MinigameResource } from "@/features/minigames/schema/resource"
import { LockedEditorProvider } from "@/features/templates/components/locked-editor"
import messages from "../messages/en.json"

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/filesystem", () => ({}))
vi.mock("@/lib/auth/utils", () => ({}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ workspaceId: "2" }),
}))
vi.mock("@/features/tags/provider/tag-hook", () => ({
  useTagSelectOptions: () => [],
}))
vi.mock("@/features/minigames/actions/update-minigame.action", () => ({
  updateMinigameAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/minigames/actions/create-minigame.action", () => ({
  createMinigameAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: () => null,
}))
vi.mock("@/features/minigames/components/sharing-node-field", () => ({
  SharingNodeField: () => null,
}))
vi.mock("@/features/minigames/components/preview/minigame-preview", () => ({
  MinigamePreview: () => null,
}))
vi.mock("@/components/direct-upload", () => ({
  DirectUploadOrInsertLink: () => null,
}))
vi.mock("@/components/public-url-section", () => ({
  PublicUrlSection: () => null,
}))

const minigame = {
  id: "1",
  workspaceId: "2",
  type: "jackpot",
  generalSettings: getDefaultMinigameGeneralSettings(),
  appearance: getDefaultMinigameAppearance("jackpot"),
  playerSettings: getDefaultMinigamePlayerSettings(),
  prizeSettings: getDefaultMinigamePrizeSettings(),
  winningMessageSettings: getDefaultMinigameWinningMessageSettings(),
  nonWinningMessageSettings: getDefaultMinigameNonWinningMessageSettings(),
} as unknown as MinigameResource

describe("minigame form on a View-only template copy", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (locked: boolean) => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <LockedEditorProvider locked={locked}>
            <MinigameForm
              minigame={minigame}
              mode="edit"
              publicUrl="https://example.test/p"
              workspaceId="2"
            />
          </LockedEditorProvider>
        </NextIntlClientProvider>,
      )
    })
  }

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent ?? "").trim() === label,
    ) as HTMLButtonElement

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("locked: Save disabled, Cancel enabled", () => {
    render(true)
    expect(button(messages.actions.save).disabled).toBe(true)
    expect(button(messages.actions.cancel).disabled).toBe(false)
  })

  test("unlocked: Save enabled", () => {
    render(false)
    expect(button(messages.actions.save).disabled).toBe(false)
  })
})
