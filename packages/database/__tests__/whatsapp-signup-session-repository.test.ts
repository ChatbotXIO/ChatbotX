import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  arrayContains: vi.fn((column: unknown, values: unknown[]) => ({
    arrayContains: [column, values],
  })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  gt: vi.fn((column: unknown, value: unknown) => ({ gt: [column, value] })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  not: vi.fn((condition: unknown) => ({ not: condition })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [Array.from(strings), values],
  })),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  arrayContains: mocks.arrayContains,
  db: {},
  eq: mocks.eq,
  gt: mocks.gt,
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: mocks.isNull,
  lt: vi.fn(),
  lte: vi.fn(),
  not: mocks.not,
  or: vi.fn(),
  sql: mocks.sql,
}))

vi.mock("../src/schema", () => ({
  integrationWhatsappModel: {
    id: "integrationId",
    workspaceId: "integrationWorkspaceId",
    phoneNumberId: "phoneNumberId",
    auth: "auth",
  },
  whatsappSignupSessionModel: {
    id: "id",
    userId: "userId",
    ownerId: "ownerId",
    workspaceId: "workspaceId",
    candidatePhoneNumberIds: "candidatePhoneNumberIds",
    claimedPhoneNumberIds: "claimedPhoneNumberIds",
    expiresAt: "expiresAt",
    consumedAt: "consumedAt",
  },
}))

const { whatsappSignupSessionRepository } = await import(
  "../src/repositories/integration-whatsapp/signup-session"
)

type UpdateBuilder = {
  update: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
}

function buildUpdateTx(returningResult: unknown[]): UpdateBuilder {
  const returning = vi.fn().mockResolvedValue(returningResult)
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { update, set, where, returning }
}

describe("claimSignupSessionPhoneNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("claims a candidate phone number", async () => {
    const tx = buildUpdateTx([
      { id: "session-1", claimedPhoneNumberIds: ["pn-1"] },
    ])

    await expect(
      whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
        id: "session-1",
        userId: "user-1",
        ownerId: "owner-1",
        phoneNumberId: "pn-1",
        tx: tx as never,
      }),
    ).resolves.toEqual({ id: "session-1", claimedPhoneNumberIds: ["pn-1"] })

    // Candidacy is checked via arrayContains on candidatePhoneNumberIds.
    expect(mocks.arrayContains).toHaveBeenCalledWith(
      "candidatePhoneNumberIds",
      ["pn-1"],
    )
    // Not-already-claimed is checked via not(arrayContains(claimedPhoneNumberIds)).
    expect(mocks.arrayContains).toHaveBeenCalledWith("claimedPhoneNumberIds", [
      "pn-1",
    ])
    expect(mocks.not).toHaveBeenCalled()
  })

  test("returns null when the phone number is not a candidate", async () => {
    const tx = buildUpdateTx([])

    await expect(
      whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
        id: "session-1",
        userId: "user-1",
        ownerId: "owner-1",
        phoneNumberId: "pn-not-candidate",
        tx: tx as never,
      }),
    ).resolves.toBeNull()

    expect(mocks.arrayContains).toHaveBeenCalledWith(
      "candidatePhoneNumberIds",
      ["pn-not-candidate"],
    )
  })

  test("returns null when the phone number was already claimed", async () => {
    const tx = buildUpdateTx([])

    await expect(
      whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
        id: "session-1",
        userId: "user-1",
        ownerId: "owner-1",
        phoneNumberId: "pn-1",
        tx: tx as never,
      }),
    ).resolves.toBeNull()

    expect(mocks.not).toHaveBeenCalledWith({
      arrayContains: ["claimedPhoneNumberIds", ["pn-1"]],
    })
  })

  test("returns null when the session has expired", async () => {
    const tx = buildUpdateTx([])
    const now = new Date("2026-01-01T00:00:00.000Z")

    await expect(
      whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
        id: "session-1",
        userId: "user-1",
        ownerId: "owner-1",
        phoneNumberId: "pn-1",
        now,
        tx: tx as never,
      }),
    ).resolves.toBeNull()

    expect(mocks.gt).toHaveBeenCalledWith("expiresAt", now)
  })

  test("returns null for a different user or owner", async () => {
    const tx = buildUpdateTx([])

    await expect(
      whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
        id: "session-1",
        userId: "wrong-user",
        ownerId: "wrong-owner",
        phoneNumberId: "pn-1",
        tx: tx as never,
      }),
    ).resolves.toBeNull()

    expect(mocks.eq).toHaveBeenCalledWith("userId", "wrong-user")
    expect(mocks.eq).toHaveBeenCalledWith("ownerId", "wrong-owner")
  })

  // Exactly-one-wins is a Postgres row-lock guarantee on the composed WHERE
  // clause — a mocked db client always "succeeds" per call regardless of
  // contention, so it cannot itself prove atomicity. What IS verifiable
  // (and what these tests assert) is that the repository builds the
  // identical, fully-scoped filter/SET expressions every time, which is
  // what makes Postgres's row-level locking able to pick exactly one
  // winner among concurrent UPDATEs against the same row.
  test("two concurrent claims of the same phone number build the identical filter/SET expressions", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z")
    const returning = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "session-1", claimedPhoneNumberIds: ["pn-1"] },
      ])
      .mockResolvedValueOnce([])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const tx = { update } as never
    const claimInput = {
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "pn-1",
      now,
      tx,
    }

    const [first, second] = await Promise.all([
      whatsappSignupSessionRepository.claimSignupSessionPhoneNumber(claimInput),
      whatsappSignupSessionRepository.claimSignupSessionPhoneNumber(claimInput),
    ])

    // Only the mocked RETURNING values (set up above) differ between the
    // two "concurrent" calls, but the WHERE each one builds is identical.
    const results = [first, second]
    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect(results.filter((result) => result === null)).toHaveLength(1)
    expect(where).toHaveBeenCalledTimes(2)
    expect(where.mock.calls[0]).toEqual(where.mock.calls[1])
    expect(mocks.eq).toHaveBeenCalledWith("id", "session-1")
    expect(mocks.eq).toHaveBeenCalledWith("userId", "user-1")
    expect(mocks.eq).toHaveBeenCalledWith("ownerId", "owner-1")
    expect(mocks.gt).toHaveBeenCalledWith("expiresAt", now)
    expect(mocks.arrayContains).toHaveBeenCalledWith(
      "candidatePhoneNumberIds",
      ["pn-1"],
    )
    expect(mocks.not).toHaveBeenCalledWith({
      arrayContains: ["claimedPhoneNumberIds", ["pn-1"]],
    })
  })

  test("the SET expression appends the id and computes consumedAt via a cardinality-comparing CASE (the exact result only resolves against real row data)", async () => {
    const tx = buildUpdateTx([{ id: "session-1" }])

    await whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "pn-2",
      tx: tx as never,
    })

    const sqlFragments = mocks.sql.mock.calls.map(
      ([strings]: [TemplateStringsArray]) => Array.from(strings).join(""),
    )
    expect(sqlFragments.some((text) => text.includes("array_append("))).toBe(
      true,
    )
    expect(
      sqlFragments.some((text) => text.includes("CASE WHEN cardinality")),
    ).toBe(true)
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        claimedPhoneNumberIds: expect.anything(),
        consumedAt: expect.anything(),
      }),
    )
  })

  test("distinct phone number ids build independent per-id filters and are each claimed", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "session-1", claimedPhoneNumberIds: ["pn-1"] },
      ])
      .mockResolvedValueOnce([
        { id: "session-1", claimedPhoneNumberIds: ["pn-1", "pn-2"] },
      ])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const tx = { update } as never

    const first =
      await whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
        id: "session-1",
        userId: "user-1",
        ownerId: "owner-1",
        phoneNumberId: "pn-1",
        tx,
      })
    const second =
      await whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
        id: "session-1",
        userId: "user-1",
        ownerId: "owner-1",
        phoneNumberId: "pn-2",
        tx,
      })

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(mocks.arrayContains).toHaveBeenCalledWith(
      "candidatePhoneNumberIds",
      ["pn-1"],
    )
    expect(mocks.arrayContains).toHaveBeenCalledWith(
      "candidatePhoneNumberIds",
      ["pn-2"],
    )
    expect(mocks.not).toHaveBeenCalledWith({
      arrayContains: ["claimedPhoneNumberIds", ["pn-1"]],
    })
    expect(mocks.not).toHaveBeenCalledWith({
      arrayContains: ["claimedPhoneNumberIds", ["pn-2"]],
    })
  })
})

describe("bindSignupSessionWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("sets the workspaceId when it is null", async () => {
    const tx = buildUpdateTx([{ workspaceId: "ws-1" }])

    await expect(
      whatsappSignupSessionRepository.bindSignupSessionWorkspace({
        id: "session-1",
        workspaceId: "ws-1",
        tx: tx as never,
      }),
    ).resolves.toBeUndefined()

    expect(tx.set).toHaveBeenCalledWith({ workspaceId: "ws-1" })
    expect(mocks.eq).toHaveBeenCalledWith("id", "session-1")
    expect(mocks.isNull).toHaveBeenCalledWith("workspaceId")
  })

  // `WHERE workspaceId IS NULL` makes a second call a no-op at the database
  // level — nothing here reads the value it left in place; a caller that
  // needs the bound workspaceId reads it off the claim's `RETURNING`
  // instead (see `connect.ts`).
  test("second call is a no-op — the WHERE clause still targets an unset workspaceId", async () => {
    const tx = buildUpdateTx([])

    await expect(
      whatsappSignupSessionRepository.bindSignupSessionWorkspace({
        id: "session-1",
        workspaceId: "ws-2",
        tx: tx as never,
      }),
    ).resolves.toBeUndefined()

    expect(mocks.isNull).toHaveBeenCalledWith("workspaceId")
  })

  test("is scoped by id", async () => {
    const tx = buildUpdateTx([{ workspaceId: "ws-1" }])

    await whatsappSignupSessionRepository.bindSignupSessionWorkspace({
      id: "session-42",
      workspaceId: "ws-1",
      tx: tx as never,
    })

    expect(mocks.eq).toHaveBeenCalledWith("id", "session-42")
  })
})

describe("findActiveSignupSessionForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function buildSelectTx(result: unknown[]) {
    const limit = vi.fn().mockResolvedValue(result)
    const where = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ where }))
    const select = vi.fn(() => ({ from }))
    return { select, from, where, limit }
  }

  test("is scoped by id and userId only — never ownerId", async () => {
    const tx = buildSelectTx([{ id: "session-1", userId: "user-1" }])

    await expect(
      whatsappSignupSessionRepository.findActiveSignupSessionForUser({
        id: "session-1",
        userId: "user-1",
        tx: tx as never,
      }),
    ).resolves.toEqual({ id: "session-1", userId: "user-1" })

    expect(mocks.eq).toHaveBeenCalledWith("id", "session-1")
    expect(mocks.eq).toHaveBeenCalledWith("userId", "user-1")
    expect(mocks.eq).not.toHaveBeenCalledWith("ownerId", expect.anything())
  })

  test("returns null when nothing matches (expired, wrong user, or unknown id)", async () => {
    const tx = buildSelectTx([])

    await expect(
      whatsappSignupSessionRepository.findActiveSignupSessionForUser({
        id: "session-1",
        userId: "user-1",
        tx: tx as never,
      }),
    ).resolves.toBeNull()
  })
})
