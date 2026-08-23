import { describe, expect, test } from "vitest"
import {
  signMinigamePlayToken,
  verifyMinigamePlayToken,
} from "../src/minigame-play-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/

describe("minigame play token", () => {
  test("round-trips a play token", async () => {
    const token = await signMinigamePlayToken({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
    })

    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyMinigamePlayToken(token)).resolves.toMatchObject({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
    })
  })

  test("rejects expired tokens", async () => {
    const token = await signMinigamePlayToken(
      {
        workspaceId: "workspace-1",
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
      },
      -1,
    )

    await expect(verifyMinigamePlayToken(token)).rejects.toThrow(EXPIRED_RE)
  })

  test("rejects malformed tokens", async () => {
    await expect(verifyMinigamePlayToken("not-a-token")).rejects.toThrow()
  })
})
