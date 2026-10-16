import { describe, expect, test } from "vitest"
import {
  signLeaderboardViewToken,
  verifyLeaderboardViewToken,
} from "../src/leaderboard-view-token"
import { signMinigamePlayToken } from "../src/minigame-play-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/

describe("leaderboard view token", () => {
  test("round-trips a view token", async () => {
    const token = await signLeaderboardViewToken({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
    })

    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyLeaderboardViewToken(token)).resolves.toMatchObject({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
    })
  })

  test("rejects expired tokens", async () => {
    const token = await signLeaderboardViewToken(
      {
        workspaceId: "workspace-1",
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
      },
      -1,
    )

    await expect(verifyLeaderboardViewToken(token)).rejects.toThrow(EXPIRED_RE)
  })

  test("rejects malformed tokens", async () => {
    await expect(verifyLeaderboardViewToken("not-a-token")).rejects.toThrow()
  })

  test("rejects a minigame play token", async () => {
    const token = await signMinigamePlayToken({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
    })
    await expect(verifyLeaderboardViewToken(token)).rejects.toThrow()
  })
})
