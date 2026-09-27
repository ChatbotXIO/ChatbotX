import { describe, expect, test } from "vitest"
import { signMediaToken, verifyMediaToken } from "../src/media-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/

describe("media token", () => {
  test("round-trips media claims with an expiry", async () => {
    const token = await signMediaToken({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
    })

    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyMediaToken(token)).resolves.toMatchObject({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
      expiresAt: expect.any(Number),
    })
  })

  test("round-trips the optional messageCreatedAt shard hint", async () => {
    const messageCreatedAt = Date.parse("2026-01-03T12:00:00Z")
    const token = await signMediaToken({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
      messageCreatedAt,
    })

    await expect(verifyMediaToken(token)).resolves.toMatchObject({
      refId: "attachment-1",
      messageCreatedAt,
    })
  })

  test("verifies tokens minted without the messageCreatedAt hint", async () => {
    const token = await signMediaToken({
      workspaceId: "workspace-1",
      kind: "avatar",
      refId: "contact-inbox-1",
    })

    const payload = await verifyMediaToken(token)
    expect(payload.messageCreatedAt).toBeUndefined()
  })

  test("rejects tampered tokens", async () => {
    const token = await signMediaToken({
      workspaceId: "workspace-1",
      kind: "avatar",
      refId: "contact-inbox-1",
    })
    const lastCharacter = token.at(-1)
    const tamperedToken = `${token.slice(0, -1)}${lastCharacter === "A" ? "B" : "A"}`

    await expect(verifyMediaToken(tamperedToken)).rejects.toThrow()
  })

  test("rejects expired tokens", async () => {
    const token = await signMediaToken(
      {
        workspaceId: "workspace-1",
        kind: "attachment",
        refId: "attachment-1",
      },
      -1,
    )

    await expect(verifyMediaToken(token)).rejects.toThrow(EXPIRED_RE)
  })
})
