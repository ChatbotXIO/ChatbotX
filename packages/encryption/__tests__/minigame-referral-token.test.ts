import { describe, expect, test } from "vitest"
import {
  signMinigamePlayToken,
  verifyMinigamePlayToken,
} from "../src/minigame-play-token"
import {
  signMinigameReferralToken,
  verifyMinigameReferralToken,
} from "../src/minigame-referral-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/
const MISMATCH_RE = /mismatch/

describe("minigame referral token", () => {
  test("round-trips a referral token", async () => {
    const token = await signMinigameReferralToken({
      workspaceId: "workspace-1",
      minigameId: "minigame-1",
      referrerContactId: "contact-1",
    })

    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyMinigameReferralToken(token)).resolves.toMatchObject({
      workspaceId: "workspace-1",
      minigameId: "minigame-1",
      referrerContactId: "contact-1",
    })
  })

  test("rejects expired tokens", async () => {
    const token = await signMinigameReferralToken(
      {
        workspaceId: "workspace-1",
        minigameId: "minigame-1",
        referrerContactId: "contact-1",
      },
      -1,
    )

    await expect(verifyMinigameReferralToken(token)).rejects.toThrow(EXPIRED_RE)
  })

  test("rejects malformed tokens", async () => {
    await expect(verifyMinigameReferralToken("not-a-token")).rejects.toThrow()
  })

  // The security crux of the share feature: a play token proves identity (the
  // play page and action resolve it to a contact and then play, spend draws,
  // tag, and DM as them), so a referral link must never be usable as one.
  test("a referral token is not accepted as a play token, and vice versa", async () => {
    const referralToken = await signMinigameReferralToken({
      workspaceId: "workspace-1",
      minigameId: "minigame-1",
      referrerContactId: "contact-1",
    })
    await expect(verifyMinigamePlayToken(referralToken)).rejects.toThrow(
      MISMATCH_RE,
    )

    const playToken = await signMinigamePlayToken({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
    })
    await expect(verifyMinigameReferralToken(playToken)).rejects.toThrow(
      MISMATCH_RE,
    )
  })
})
