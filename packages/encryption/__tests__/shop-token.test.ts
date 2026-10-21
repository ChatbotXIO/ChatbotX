import { describe, expect, test } from "vitest"
import { signMinigamePlayToken } from "../src/minigame-play-token"
import {
  signShopPreviewToken,
  signShopToken,
  verifyShopToken,
} from "../src/shop-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/

const customer = {
  workspaceId: "1",
  contactId: "2",
  contactInboxId: "3",
  conversationId: null,
}

describe("shop token", () => {
  test("round-trips a customer token", async () => {
    const token = await signShopToken(customer)
    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyShopToken(token)).resolves.toMatchObject({
      mode: "customer",
      ...customer,
    })
  })

  test("a preview token names no contact", async () => {
    const payload = await verifyShopToken(await signShopPreviewToken("1"))
    expect(payload).toMatchObject({ mode: "preview", workspaceId: "1" })
    expect(payload).not.toHaveProperty("contactId")
  })

  test("rejects an expired token", async () => {
    const token = await signShopToken(customer, -1)
    await expect(verifyShopToken(token)).rejects.toThrow(EXPIRED_RE)
  })

  test("rejects a malformed token", async () => {
    await expect(verifyShopToken("not-a-token")).rejects.toThrow()
  })

  test("rejects another kind of signed token", async () => {
    const minigameToken = await signMinigamePlayToken({
      workspaceId: "1",
      contactId: "2",
      contactInboxId: "3",
    })
    await expect(verifyShopToken(minigameToken)).rejects.toThrow()
  })
})
