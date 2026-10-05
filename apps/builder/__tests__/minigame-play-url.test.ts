import { expect, test, vi } from "vitest"

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => "https://broker.example.test",
}))

const { buildMinigamePlayUrl } = await import(
  "@/features/minigames/lib/play-url"
)

test("is the edit page's Copy URL, with the per-contact token left as a variable", () => {
  expect(buildMinigamePlayUrl("123")).toBe(
    "https://broker.example.test/minigames?minigameId=123&token={{minigame_play_token}}",
  )
})
