import { beforeEach, describe, expect, test, vi } from "vitest"

type Row = {
  id: string
  userId: string
  deviceId: string
  familyId: string
  tokenHash: string
  expiresAt: Date
  rotatedAt: Date | null
  revoked: Date | null
}

const { fakeDb, mobileRefreshTokenRepository, rows } = vi.hoisted(() => {
  const rows: Row[] = []
  let nextId = 1
  const fakeDb = {
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      await callback(fakeDb),
  }
  const mobileRefreshTokenRepository = {
    insert: (values: Omit<Row, "id" | "rotatedAt" | "revoked">) => {
      if (rows.some((row) => row.tokenHash === values.tokenHash)) {
        throw new Error("duplicate tokenHash")
      }
      rows.push({
        ...values,
        id: String(nextId++),
        rotatedAt: null,
        revoked: null,
      })
    },
    spendActive: (tokenHash: string, now: Date) => {
      const row = rows.find(
        (candidate) =>
          candidate.tokenHash === tokenHash &&
          candidate.rotatedAt === null &&
          candidate.revoked === null &&
          candidate.expiresAt > now,
      )
      if (!row) {
        return null
      }
      row.rotatedAt = now
      return { ...row }
    },
    findByHash: (tokenHash: string) => {
      const row = rows.find((candidate) => candidate.tokenHash === tokenHash)
      return row ? { ...row } : null
    },
    revokeFamilyByHash: (tokenHash: string, now: Date) => {
      const familyId = rows.find(
        (candidate) => candidate.tokenHash === tokenHash,
      )?.familyId
      if (!familyId) {
        return
      }
      for (const row of rows) {
        if (row.familyId === familyId && row.revoked === null) {
          row.revoked = now
        }
      }
    },
    revokeAllForUser: (userId: string, now: Date) => {
      for (const row of rows) {
        if (row.userId === userId && row.revoked === null) {
          row.revoked = now
        }
      }
    },
    deleteSpentInFamily: (familyId: string, before: Date) => {
      for (let index = rows.length - 1; index >= 0; index--) {
        if (
          rows[index].familyId === familyId &&
          rows[index].rotatedAt &&
          rows[index].rotatedAt < before
        ) {
          rows.splice(index, 1)
        }
      }
    },
    deleteExpiredForUser: (userId: string, now: Date) => {
      for (let index = rows.length - 1; index >= 0; index--) {
        if (rows[index].userId === userId && rows[index].expiresAt < now) {
          rows.splice(index, 1)
        }
      }
    },
  }
  return { fakeDb, mobileRefreshTokenRepository, rows }
})

vi.mock("@chatbotx.io/database/client", () => ({ db: fakeDb }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  mobileRefreshTokenRepository,
}))

const { mobileRefreshTokenService, MOBILE_REFRESH_TOKEN_TTL_MS } = await import(
  "../src/mobile-auth/service"
)
const { hashToken } = await import("../src/workspace-api-token/credentials")

beforeEach(() => {
  rows.length = 0
})

describe("mobileRefreshTokenService", () => {
  test("issues an opaque token and stores only its hash", async () => {
    const issued = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "device-a",
    })

    expect(issued.token.startsWith("cbx_mrt_")).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenHash).toBe(await hashToken(issued.token))
    expect(JSON.stringify(rows)).not.toContain(issued.token)
    expect(issued.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      MOBILE_REFRESH_TOKEN_TTL_MS - 5000,
    )
  })

  test("rotation spends the presented token and issues a successor in the same family", async () => {
    const first = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "device-a",
    })

    const rotation = await mobileRefreshTokenService.rotate({
      token: first.token,
    })

    expect(rotation).toMatchObject({
      kind: "rotated",
      userId: "1",
      deviceId: "device-a",
    })
    if (rotation.kind !== "rotated") {
      throw new Error("expected rotated")
    }
    expect(rotation.refreshToken.token).not.toBe(first.token)
    expect(rows).toHaveLength(2)
    expect(rows[0].rotatedAt).toBeInstanceOf(Date)
    expect(rows[1].rotatedAt).toBeNull()
    expect(rows[1].familyId).toBe(rows[0].familyId)
  })

  test("the successor can itself be rotated", async () => {
    const first = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "device-a",
    })
    const second = await mobileRefreshTokenService.rotate({
      token: first.token,
    })
    if (second.kind !== "rotated") {
      throw new Error("expected rotated")
    }

    const third = await mobileRefreshTokenService.rotate({
      token: second.refreshToken.token,
    })

    expect(third.kind).toBe("rotated")
  })

  test("replaying a spent token revokes the whole family, including the live successor", async () => {
    const first = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "device-a",
    })
    const rotation = await mobileRefreshTokenService.rotate({
      token: first.token,
    })
    if (rotation.kind !== "rotated") {
      throw new Error("expected rotated")
    }

    const replay = await mobileRefreshTokenService.rotate({
      token: first.token,
    })

    expect(replay).toEqual({
      kind: "reused",
      userId: "1",
      deviceId: "device-a",
    })
    expect(rows.every((row) => row.revoked instanceof Date)).toBe(true)
    // The legitimate successor is dead too: the thief and the owner both log in again.
    await expect(
      mobileRefreshTokenService.rotate({ token: rotation.refreshToken.token }),
    ).resolves.toMatchObject({ kind: "reused" })
  })

  test("reuse revokes only its own family", async () => {
    const mine = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "device-a",
    })
    const other = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "device-b",
    })
    await mobileRefreshTokenService.rotate({ token: mine.token })

    await mobileRefreshTokenService.rotate({ token: mine.token })

    const otherHash = await hashToken(other.token)
    const otherRow = rows.find((row) => row.tokenHash === otherHash)
    expect(otherRow?.revoked).toBeNull()
    await expect(
      mobileRefreshTokenService.rotate({ token: other.token }),
    ).resolves.toMatchObject({ kind: "rotated" })
  })

  test("rotation drops this family's tokens that were spent more than a day ago, and keeps recent ones", async () => {
    const first = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "d",
    })
    const second = await mobileRefreshTokenService.rotate({
      token: first.token,
    })
    if (second.kind !== "rotated") {
      throw new Error("expected rotated")
    }
    // The first token was spent two days ago.
    rows[0].rotatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

    await mobileRefreshTokenService.rotate({
      token: second.refreshToken.token,
    })

    const hashes = rows.map((row) => row.tokenHash)
    expect(hashes).not.toContain(await hashToken(first.token))
    expect(rows).toHaveLength(2)
    // The recently spent one is still there to catch a replay.
    await expect(
      mobileRefreshTokenService.rotate({ token: second.refreshToken.token }),
    ).resolves.toMatchObject({ kind: "reused" })
  })

  test("a new login sweeps that user's expired tokens but never another user's", async () => {
    await mobileRefreshTokenService.issue({ userId: "1", deviceId: "old" })
    await mobileRefreshTokenService.issue({ userId: "2", deviceId: "other" })
    rows[0].expiresAt = new Date(Date.now() - 1000)
    rows[1].expiresAt = new Date(Date.now() - 1000)

    await mobileRefreshTokenService.issue({ userId: "1", deviceId: "new" })

    expect(rows.map((row) => [row.userId, row.deviceId])).toEqual([
      ["2", "other"],
      ["1", "new"],
    ])
  })

  test("an unknown token is invalid and revokes nothing", async () => {
    await mobileRefreshTokenService.issue({ userId: "1", deviceId: "d" })

    await expect(
      mobileRefreshTokenService.rotate({ token: "cbx_mrt_unknown" }),
    ).resolves.toEqual({ kind: "invalid" })
    expect(rows.every((row) => row.revoked === null)).toBe(true)
  })

  test("an expired token is invalid", async () => {
    const issued = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "d",
    })
    rows[0].expiresAt = new Date(Date.now() - 1000)

    await expect(
      mobileRefreshTokenService.rotate({ token: issued.token }),
    ).resolves.toEqual({ kind: "invalid" })
  })

  test("a revoked token cannot be rotated", async () => {
    const issued = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "d",
    })
    await mobileRefreshTokenService.revokeByToken({ token: issued.token })

    await expect(
      mobileRefreshTokenService.rotate({ token: issued.token }),
    ).resolves.toMatchObject({ kind: "reused" })
  })

  test("revokeByToken (logout) ends the family and ignores unknown tokens", async () => {
    const issued = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "d",
    })

    await mobileRefreshTokenService.revokeByToken({ token: "cbx_mrt_nope" })
    expect(rows[0].revoked).toBeNull()

    await mobileRefreshTokenService.revokeByToken({ token: issued.token })
    expect(rows[0].revoked).toBeInstanceOf(Date)
  })

  test("revokeAllForUser ends every device of that user and no one else", async () => {
    const phone = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "phone",
    })
    const tablet = await mobileRefreshTokenService.issue({
      userId: "1",
      deviceId: "tablet",
    })
    const stranger = await mobileRefreshTokenService.issue({
      userId: "2",
      deviceId: "phone",
    })

    await mobileRefreshTokenService.revokeAllForUser({ userId: "1" })

    await expect(
      mobileRefreshTokenService.rotate({ token: phone.token }),
    ).resolves.toMatchObject({ kind: "reused" })
    await expect(
      mobileRefreshTokenService.rotate({ token: tablet.token }),
    ).resolves.toMatchObject({ kind: "reused" })
    await expect(
      mobileRefreshTokenService.rotate({ token: stranger.token }),
    ).resolves.toMatchObject({ kind: "rotated" })
  })
})
