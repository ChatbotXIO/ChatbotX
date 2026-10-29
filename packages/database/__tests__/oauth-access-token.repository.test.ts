import { describe, expect, test, vi } from "vitest"
import { oauthAccessTokenRepository } from "../src/repositories/oauth-access-token/repository"

describe("oauthAccessTokenRepository.listActiveByUser", () => {
  test("queries only tokens whose refresh grant remains active", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z")
    const findMany = vi.fn().mockResolvedValue([])

    await expect(
      oauthAccessTokenRepository.listActiveByUser("user-1", now, {
        query: { oauthAccessTokenModel: { findMany } },
      } as never),
    ).resolves.toEqual([])

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: {
        refreshTokenExpiresAt: { gt: now },
        userId: "user-1",
      },
      with: { client: true },
    })
  })
})
