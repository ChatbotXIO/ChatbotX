import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  deleteWhere: vi.fn(),
  selectRows: [] as { id: string; sourceId: string; createdAt: Date }[],
  uniqueViolation: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

vi.mock("@chatbotx.io/database/schema", () => ({
  messengerMessageTemplateModel: {
    id: "T.id",
    integrationMessengerId: "T.integrationMessengerId",
    sourceId: "T.sourceId",
    clonedFromTemplateId: "T.clonedFromTemplateId",
    createdAt: "T.createdAt",
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      messengerMessageTemplateModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
    },
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertValues(values)
        const chain = {
          returning: () => mocks.insertReturning(values),
          onConflictDoUpdate: (config: unknown) => {
            mocks.onConflictDoUpdate(config)
            return Promise.resolve()
          },
        }
        return chain
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values)
        return {
          where: (where: unknown) => {
            mocks.updateWhere(where)
            return Object.assign(Promise.resolve(), {
              returning: () => mocks.updateReturning(values),
            })
          },
        }
      },
    }),
    delete: () => ({
      where: (where: unknown) => {
        mocks.deleteWhere(where)
        return Promise.resolve()
      },
    }),
    select: () => ({
      from: () => ({ where: () => Promise.resolve(mocks.selectRows) }),
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (left: unknown, right: unknown) => ({ __eq: [left, right] }),
  inArray: (left: unknown, right: unknown) => ({ __inArray: [left, right] }),
  isNull: (value: unknown) => ({ __isNull: value }),
  isUniqueViolationError: (error: unknown) => mocks.uniqueViolation(error),
}))

vi.mock("@chatbotx.io/utils", () => ({ createId: () => "new-id" }))

const {
  messengerMessageTemplateService,
  cloneReservationSourceId,
  CLONE_RESERVATION_TTL_MS,
} = await import("../src/messenger-message-template/service")

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  status: "APPROVED",
  clonedFromTemplateId: null,
  ...overrides,
})

beforeEach(() => {
  for (const fn of [
    mocks.findFirst,
    mocks.findMany,
    mocks.insertValues,
    mocks.insertReturning,
    mocks.onConflictDoUpdate,
    mocks.updateSet,
    mocks.updateWhere,
    mocks.updateReturning,
    mocks.deleteWhere,
  ]) {
    fn.mockReset()
  }
  mocks.uniqueViolation.mockReset().mockReturnValue(false)
  mocks.updateReturning.mockImplementation((values: unknown) =>
    Promise.resolve([{ id: "row", ...(values as object) }]),
  )
  mocks.selectRows = []
  mocks.findMany.mockResolvedValue([])
})

describe("findCloneCandidate", () => {
  test("prefers the row cloned from the source, then an approved same-name row, then the oldest", async () => {
    const lookup = {
      integrationMessengerId: "im-a",
      clonedFromTemplateId: "src",
      name: "promo",
      language: "vi",
    }
    mocks.findMany.mockResolvedValue([
      row("stale", { status: "REJECTED" }),
      row("approved"),
      row("linked", { status: "PENDING", clonedFromTemplateId: "src" }),
    ])
    expect(
      (await messengerMessageTemplateService.findCloneCandidate(lookup))?.id,
    ).toBe("linked")

    mocks.findMany.mockResolvedValue([
      row("stale", { status: "REJECTED" }),
      row("approved"),
    ])
    expect(
      (await messengerMessageTemplateService.findCloneCandidate(lookup))?.id,
    ).toBe("approved")

    mocks.findMany.mockResolvedValue([row("stale", { status: "REJECTED" })])
    expect(
      (await messengerMessageTemplateService.findCloneCandidate(lookup))?.id,
    ).toBe("stale")

    expect(mocks.findMany).toHaveBeenLastCalledWith({
      where: {
        integrationMessengerId: "im-a",
        OR: [
          { clonedFromTemplateId: "src" },
          { name: "promo", language: "vi" },
        ],
      },
      orderBy: { createdAt: "asc" },
    })
  })
})

describe("reserveClone", () => {
  const input = {
    integrationMessengerId: "im-a",
    clonedFromTemplateId: "src",
    template: {
      name: "promo",
      language: "vi",
      category: "MARKETING",
      parameter_format: "NAMED",
      components: [{ type: "BODY" }],
    },
  }

  test("inserts a pending placeholder row keyed by the source template", async () => {
    mocks.insertReturning.mockResolvedValue([row("res")])

    const result = await messengerMessageTemplateService.reserveClone(input)

    expect(result).toEqual({ outcome: "reserved", row: row("res") })
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationMessengerId: "im-a",
        clonedFromTemplateId: "src",
        sourceId: cloneReservationSourceId("src"),
        status: "PENDING",
        name: "promo",
        parameterFormat: "NAMED",
        rejectionReason: null,
      }),
    )
  })

  test("turns the unique-index violation of a concurrent reservation into a conflict", async () => {
    mocks.insertReturning.mockRejectedValue(new Error("duplicate"))
    mocks.uniqueViolation.mockReturnValue(true)

    await expect(
      messengerMessageTemplateService.reserveClone(input),
    ).resolves.toEqual({
      outcome: "conflict",
    })
  })

  test("rethrows any other insert failure", async () => {
    mocks.insertReturning.mockRejectedValue(new Error("connection lost"))

    await expect(
      messengerMessageTemplateService.reserveClone(input),
    ).rejects.toThrow("connection lost")
  })
})

describe("fulfillReservation / discardReservation / linkClone", () => {
  test("fulfill rewrites the placeholder with Meta's id, status and rejection reason", async () => {
    await messengerMessageTemplateService.fulfillReservation({
      reservationId: "res",
      template: {
        id: "meta-1",
        name: "promo",
        status: "REJECTED",
        language: "vi",
        category: "MARKETING",
        components: [],
        rejection_reason: "Spam",
      },
    })

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "meta-1",
        status: "REJECTED",
        rejectionReason: "Spam",
        parameterFormat: "POSITIONAL",
      }),
    )
    expect(mocks.updateWhere).toHaveBeenCalledWith({ __eq: ["T.id", "res"] })
  })

  test("fulfill fails explicitly when the reservation was swept meanwhile", async () => {
    mocks.updateReturning.mockResolvedValue([])

    await expect(
      messengerMessageTemplateService.fulfillReservation({
        reservationId: "gone",
        template: {
          id: "meta-1",
          name: "promo",
          status: "APPROVED",
          language: "vi",
          category: "MARKETING",
          components: [],
        },
      }),
    ).rejects.toThrow("Clone reservation gone no longer exists")
  })

  test("discard deletes exactly the reservation row", async () => {
    await messengerMessageTemplateService.discardReservation("res")
    expect(mocks.deleteWhere).toHaveBeenCalledWith({ __eq: ["T.id", "res"] })
  })

  test("link only fills an empty clone link", async () => {
    await messengerMessageTemplateService.linkClone({
      id: "t",
      clonedFromTemplateId: "src",
    })
    expect(mocks.updateSet).toHaveBeenCalledWith({
      clonedFromTemplateId: "src",
    })
    expect(mocks.updateWhere).toHaveBeenCalledWith({
      __and: [{ __eq: ["T.id", "t"] }, { __isNull: "T.clonedFromTemplateId" }],
    })
  })
})

describe("upsertFromMeta / deleteMissingForIntegration", () => {
  test("upserts by (page, sourceId) without ever touching the clone link", async () => {
    await messengerMessageTemplateService.upsertFromMeta({
      integrationMessengerId: "im-a",
      templates: [
        {
          id: "meta-1",
          name: "promo",
          status: "APPROVED",
          language: "vi",
          category: "MARKETING",
          parameter_format: null,
          components: [],
        },
      ],
    })

    const config = mocks.onConflictDoUpdate.mock.calls[0][0] as {
      set: Record<string, unknown>
    }
    expect(config.set).not.toHaveProperty("clonedFromTemplateId")
    expect(config.set).toMatchObject({
      status: "APPROVED",
      parameterFormat: "POSITIONAL",
      rejectionReason: null,
    })
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationMessengerId: "im-a",
        sourceId: "meta-1",
      }),
    )
  })

  test("a full sync deletes stale rows but keeps a clone reservation still in flight", async () => {
    const now = new Date("2026-09-06T10:00:00Z")
    mocks.selectRows = [
      { id: "keep", sourceId: "meta-1", createdAt: now },
      { id: "stale", sourceId: "meta-old", createdAt: now },
      {
        id: "in-flight-reservation",
        sourceId: cloneReservationSourceId("src"),
        createdAt: new Date(now.getTime() - CLONE_RESERVATION_TTL_MS + 1000),
      },
      {
        id: "orphan-reservation",
        sourceId: cloneReservationSourceId("src-2"),
        createdAt: new Date(now.getTime() - CLONE_RESERVATION_TTL_MS),
      },
    ]

    await messengerMessageTemplateService.deleteMissingForIntegration({
      integrationMessengerId: "im-a",
      keepSourceIds: ["meta-1"],
      now,
    })

    expect(mocks.deleteWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["T.integrationMessengerId", "im-a"] },
        {
          __inArray: [
            "T.sourceId",
            ["meta-old", cloneReservationSourceId("src-2")],
          ],
        },
      ],
    })
  })

  test("an expired reservation fulfilled between the stale select and the delete survives", async () => {
    const now = new Date("2026-09-06T10:00:00Z")
    const expiredReservation = {
      id: "res-slow",
      sourceId: cloneReservationSourceId("src"),
      createdAt: new Date(now.getTime() - CLONE_RESERVATION_TTL_MS),
    }
    mocks.selectRows = [expiredReservation]
    // The slow Meta create answers right after the sync selected the row.
    mocks.deleteWhere.mockImplementationOnce(async () => {
      await messengerMessageTemplateService.fulfillReservation({
        reservationId: "res-slow",
        template: {
          id: "meta-late",
          name: "promo",
          status: "APPROVED",
          language: "vi",
          category: "MARKETING",
          components: [],
        },
      })
    })

    await messengerMessageTemplateService.deleteMissingForIntegration({
      integrationMessengerId: "im-a",
      keepSourceIds: [],
      now,
    })

    // The delete targets the reservation sourceId only; the fulfilled row
    // now carries "meta-late" and is not matched by it.
    const [where] = mocks.deleteWhere.mock.calls[0] as [
      { __and: [unknown, { __inArray: [string, string[]] }] },
    ]
    expect(where.__and[1].__inArray).toEqual([
      "T.sourceId",
      [cloneReservationSourceId("src")],
    ])
    expect(where.__and[1].__inArray[1]).not.toContain("meta-late")
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "meta-late" }),
    )
  })

  test("a clone interleaved with a full sync keeps its reservation, so a second reserve still conflicts", async () => {
    // 1. clone A reserves the (page, source) pair
    mocks.insertReturning.mockResolvedValueOnce([row("res-a")])
    const reserved = await messengerMessageTemplateService.reserveClone({
      integrationMessengerId: "im-a",
      clonedFromTemplateId: "src",
      template: {
        name: "promo",
        language: "vi",
        category: "MARKETING",
        parameter_format: null,
        components: [],
      },
    })
    expect(reserved.outcome).toBe("reserved")

    // 2. a full sync runs while Meta has not answered yet: Meta does not list
    //    the template, but the fresh reservation is not swept
    mocks.selectRows = [
      {
        id: "res-a",
        sourceId: cloneReservationSourceId("src"),
        createdAt: new Date(),
      },
    ]
    await messengerMessageTemplateService.deleteMissingForIntegration({
      integrationMessengerId: "im-a",
      keepSourceIds: [],
    })
    expect(mocks.deleteWhere).not.toHaveBeenCalled()

    // 3. clone B for the same pair hits the unique index instead of Meta
    mocks.insertReturning.mockRejectedValueOnce(new Error("duplicate"))
    mocks.uniqueViolation.mockReturnValueOnce(true)
    await expect(
      messengerMessageTemplateService.reserveClone({
        integrationMessengerId: "im-a",
        clonedFromTemplateId: "src",
        template: {
          name: "promo",
          language: "vi",
          category: "MARKETING",
          parameter_format: null,
          components: [],
        },
      }),
    ).resolves.toEqual({ outcome: "conflict" })

    // 4. clone A's fulfil still finds its row
    await messengerMessageTemplateService.fulfillReservation({
      reservationId: "res-a",
      template: {
        id: "meta-new",
        name: "promo",
        status: "PENDING",
        language: "vi",
        category: "MARKETING",
        components: [],
      },
    })
    expect(mocks.updateWhere).toHaveBeenLastCalledWith({
      __eq: ["T.id", "res-a"],
    })
  })

  test("a full sync with nothing stale issues no delete", async () => {
    mocks.selectRows = [
      { id: "keep", sourceId: "meta-1", createdAt: new Date() },
    ]
    await messengerMessageTemplateService.deleteMissingForIntegration({
      integrationMessengerId: "im-a",
      keepSourceIds: ["meta-1"],
    })
    expect(mocks.deleteWhere).not.toHaveBeenCalled()
  })
})
