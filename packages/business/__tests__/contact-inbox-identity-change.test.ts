import { shouldAddressBySourceUserId } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDbFindFirst,
  mockFindWithContact,
  mockInvalidateCacheByTags,
  mockIsUniqueViolationError,
  mockLoggerWarn,
  mockUpdateIdentityGuarded,
} = vi.hoisted(() => ({
  mockDbFindFirst: vi.fn(),
  mockFindWithContact: vi.fn(),
  mockInvalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
  mockIsUniqueViolationError: vi.fn().mockReturnValue(false),
  mockLoggerWarn: vi.fn(),
  mockUpdateIdentityGuarded: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactInboxModel: {
        findFirst: mockDbFindFirst,
        findMany: vi.fn(),
      },
    },
  },
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  isUniqueViolationError: mockIsUniqueViolationError,
  or: vi.fn(),
  sql: Object.assign(vi.fn(), { join: vi.fn() }),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxOperationalColumns: { sourceIdentityHistory: false },
  contactInboxRepository: {
    findWithContact: mockFindWithContact,
    updateIdentityGuarded: mockUpdateIdentityGuarded,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  CONTACT_INBOX_IDENTITY_CHANGE_REASONS: {
    parentFallback: "parentFallback",
    phoneChanged: "phoneChanged",
    userIdChanged: "userIdChanged",
  },
  CONTACT_INBOX_SOURCE_ID_KEY: "ContactInbox_inboxId_sourceId_key",
  CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY:
    "ContactInbox_inboxId_sourceParentUserId_key",
  CONTACT_INBOX_SOURCE_USER_ID_KEY: "ContactInbox_inboxId_sourceUserId_key",
  contactModel: { id: "contactId", workspaceId: "workspaceId" },
  contactInboxModel: {
    contactId: "contactId",
    id: "id",
    inboxId: "inboxId",
    sourceId: "sourceId",
    sourceParentUserId: "sourceParentUserId",
    sourceUserId: "sourceUserId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mockLoggerWarn },
}))

const { contactInboxService } = await import("../src/contact-inbox/service")
const { resolveRotationPlan, shouldAppendContactInboxIdentityHistory } =
  await import("../src/contact-inbox/identity-rotation")

const contact = {
  id: "contact-1",
  phoneNumber: "+84900000001",
  workspaceId: "workspace-1",
}

const phoneKeyed = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
  sourceId: "84900000001",
  sourceUserId: "bsuid-old",
  sourceParentUserId: "parent-old",
  contact,
}

const bsuidKeyed = {
  ...phoneKeyed,
  sourceId: "bsuid-old",
}

describe("shouldAppendContactInboxIdentityHistory", () => {
  test("requests one atomic append when an existing identity is replaced", () => {
    expect(
      shouldAppendContactInboxIdentityHistory({
        row: phoneKeyed,
        set: {
          sourceId: "84900000002",
          sourceUserId: "bsuid-new",
          sourceParentUserId: "parent-new",
        },
      }),
    ).toBe(true)
  })

  test("does not append for null backfills, username-only writes, or no-ops", () => {
    const row = {
      ...phoneKeyed,
      sourceUserId: null,
      sourceParentUserId: null,
      sourceIdentityHistory: null,
    }

    expect(
      shouldAppendContactInboxIdentityHistory({
        row,
        set: { sourceUserId: "bsuid-new", sourceParentUserId: "parent-new" },
      }),
    ).toBe(false)
    expect(
      shouldAppendContactInboxIdentityHistory({
        row,
        set: {},
      }),
    ).toBe(false)
  })
})

const resolveRecipientParamsSemantics = (identity: {
  sourceId: string
  sourceUserId: string | null
}) =>
  shouldAddressBySourceUserId(identity) && identity.sourceUserId
    ? { recipient: identity.sourceUserId }
    : { to: identity.sourceId }

describe("resolveRotationPlan", () => {
  test.each([
    {
      label: "phone-keyed row with a visible phone",
      row: phoneKeyed,
      newPhone: "84900000002",
      expected: {
        outcome: "apply",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-old",
        },
        set: {
          sourceId: "84900000002",
          sourceUserId: "bsuid-new",
        },
        reportPhoneTransition: {
          previousPhone: "84900000001",
          newPhone: "84900000002",
        },
      },
    },
    {
      label: "BSUID-keyed row with a visible phone",
      row: bsuidKeyed,
      newPhone: "84900000002",
      expected: {
        outcome: "apply",
        guard: { sourceId: "bsuid-old", sourceUserId: "bsuid-old" },
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
        reportPhoneTransition: {
          previousPhone: "84900000001",
          newPhone: "84900000002",
        },
      },
    },
    {
      label: "empty route with a visible phone",
      row: { ...phoneKeyed, sourceId: "" },
      newPhone: "84900000002",
      expected: {
        outcome: "apply",
        guard: { sourceId: "", sourceUserId: "bsuid-old" },
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
        reportPhoneTransition: {
          previousPhone: "84900000001",
          newPhone: "84900000002",
        },
      },
    },
    {
      label: "phone-keyed row with a hidden phone",
      row: phoneKeyed,
      newPhone: undefined,
      expected: {
        outcome: "apply",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-old",
        },
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
      },
    },
    {
      label: "BSUID-keyed row with a hidden phone",
      row: bsuidKeyed,
      newPhone: undefined,
      expected: {
        outcome: "apply",
        guard: { sourceId: "bsuid-old", sourceUserId: "bsuid-old" },
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
      },
    },
    {
      label: "empty route with a hidden phone",
      row: { ...phoneKeyed, sourceId: "" },
      newPhone: undefined,
      expected: {
        outcome: "apply",
        guard: { sourceId: "", sourceUserId: "bsuid-old" },
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
      },
    },
  ])("plans $label", ({ row, newPhone, expected }) => {
    expect(
      resolveRotationPlan({
        row,
        matchKind: "previous",
        matchedBy: "sourceUserId",
        matchedValue: "bsuid-old",
        change: {
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousPhone: "84900000001",
          newPhone,
        },
      }),
    ).toEqual(expected)
  })

  test("reports a fully applied visible-phone replay", () => {
    expect(
      resolveRotationPlan({
        row: {
          ...phoneKeyed,
          sourceId: "84900000002",
          sourceUserId: "bsuid-new",
        },
        matchKind: "current",
        matchedBy: "sourceUserId",
        matchedValue: "bsuid-new",
        change: {
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousPhone: "84900000001",
          newPhone: "84900000002",
        },
      }),
    ).toEqual({
      outcome: "alreadyApplied",
      reportPhoneTransition: {
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
    })
  })

  test("repairs a partial hidden-phone replay", () => {
    expect(
      resolveRotationPlan({
        row: { ...phoneKeyed, sourceUserId: "bsuid-new" },
        matchKind: "current",
        matchedBy: "sourceUserId",
        matchedValue: "bsuid-new",
        change: {
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousPhone: "84900000001",
        },
      }),
    ).toEqual({
      outcome: "apply",
      guard: {
        sourceId: "84900000001",
        sourceUserId: "bsuid-new",
      },
      set: { sourceId: "bsuid-new" },
    })
  })

  test("rejects an unrelated stored sourceUserId as stale", () => {
    expect(
      resolveRotationPlan({
        row: { ...phoneKeyed, sourceUserId: "bsuid-other" },
        matchKind: "current",
        matchedBy: "sourceParentUserId",
        matchedValue: "parent-new",
        change: {
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousParentUserId: "parent-old",
          parentUserId: "parent-new",
        },
      }),
    ).toEqual({ outcome: "stale" })
  })

  test.each([
    {
      label: "new phone",
      matchedBy: "sourceId" as const,
      matchedValue: "84900000002",
      row: {
        ...phoneKeyed,
        sourceId: "84900000002",
        sourceUserId: "bsuid-other",
      },
      change: {
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
    },
    {
      label: "new parent with a hidden phone",
      matchedBy: "sourceParentUserId" as const,
      matchedValue: "parent-new",
      row: {
        ...phoneKeyed,
        sourceUserId: "bsuid-other",
        sourceParentUserId: "parent-new",
      },
      change: {
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        parentUserId: "parent-new",
      },
    },
  ])("rejects a current $label match with an unrelated sourceUserId when previousUserId is absent", ({
    change,
    matchedBy,
    matchedValue,
    row,
  }) => {
    expect(
      resolveRotationPlan({
        row,
        matchKind: "current",
        matchedBy,
        matchedValue,
        change,
      }),
    ).toEqual({ outcome: "stale" })
  })

  test("allows a current match whose sourceUserId still equals previousUserId", () => {
    expect(
      resolveRotationPlan({
        row: phoneKeyed,
        matchKind: "current",
        matchedBy: "sourceParentUserId",
        matchedValue: "parent-new",
        change: {
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousParentUserId: "parent-old",
          parentUserId: "parent-new",
        },
      }),
    ).toMatchObject({
      outcome: "apply",
      guard: {
        sourceId: "84900000001",
        sourceParentUserId: "parent-old",
        sourceUserId: "bsuid-old",
      },
      set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
    })
  })

  test.each([
    {
      label: "current phone match repairs a missing sourceUserId",
      row: {
        ...phoneKeyed,
        sourceId: "84900000002",
        sourceUserId: null,
      },
      matchKind: "current" as const,
      matchedBy: "sourceId" as const,
      matchedValue: "84900000002",
      change: {
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
      expectedSet: { sourceUserId: "bsuid-new" },
      expectedRecipient: { to: "84900000002" },
    },
    {
      label: "current phone match advances a previous sourceUserId",
      row: {
        ...phoneKeyed,
        sourceId: "84900000002",
      },
      matchKind: "current" as const,
      matchedBy: "sourceId" as const,
      matchedValue: "84900000002",
      change: {
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
      expectedSet: { sourceUserId: "bsuid-new" },
      expectedRecipient: { to: "84900000002" },
    },
    {
      label: "current scoped-id match repairs a visible phone route",
      row: {
        ...phoneKeyed,
        sourceUserId: "bsuid-new",
      },
      matchKind: "current" as const,
      matchedBy: "sourceUserId" as const,
      matchedValue: "bsuid-new",
      change: {
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
      expectedSet: { sourceId: "84900000002" },
      expectedRecipient: { to: "84900000002" },
    },
    {
      label: "current sourceId-only BSUID state repairs sourceUserId",
      row: {
        ...phoneKeyed,
        sourceId: "bsuid-new",
        sourceUserId: null,
      },
      matchKind: "current" as const,
      matchedBy: "sourceId" as const,
      matchedValue: "bsuid-new",
      change: {
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "",
        newPhone: "84900000002",
      },
      expectedSet: { sourceUserId: "bsuid-new" },
      expectedRecipient: { recipient: "bsuid-new" },
    },
    {
      label: "current sourceUserId-only hidden-phone state repairs sourceId",
      row: {
        ...phoneKeyed,
        sourceId: "",
        sourceUserId: "bsuid-new",
      },
      matchKind: "current" as const,
      matchedBy: "sourceUserId" as const,
      matchedValue: "bsuid-new",
      change: {
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
      },
      expectedSet: { sourceId: "bsuid-new" },
      expectedRecipient: { recipient: "bsuid-new" },
    },
    {
      label: "previous phone match rotates a null sourceUserId",
      row: { ...phoneKeyed, sourceUserId: null },
      matchKind: "previous" as const,
      matchedBy: "sourceId" as const,
      matchedValue: "84900000001",
      change: {
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
      expectedSet: {
        sourceId: "84900000002",
        sourceUserId: "bsuid-new",
      },
      expectedRecipient: { to: "84900000002" },
    },
    {
      label: "previous keyed phone match keeps the no-previousUserId exception",
      row: { ...phoneKeyed, sourceUserId: "bsuid-unreported-old" },
      matchKind: "previous" as const,
      matchedBy: "sourceId" as const,
      matchedValue: "84900000001",
      change: {
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
      expectedSet: {
        sourceId: "84900000002",
        sourceUserId: "bsuid-new",
      },
      expectedRecipient: { to: "84900000002" },
    },
    {
      label:
        "previous keyed parent match keeps the no-previousUserId exception",
      row: { ...phoneKeyed, sourceUserId: "bsuid-unreported-old" },
      matchKind: "previous" as const,
      matchedBy: "sourceParentUserId" as const,
      matchedValue: "parent-old",
      change: {
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        parentUserId: "parent-new",
      },
      expectedSet: {
        sourceId: "bsuid-new",
        sourceParentUserId: "parent-new",
        sourceUserId: "bsuid-new",
      },
      expectedRecipient: { recipient: "bsuid-new" },
    },
    {
      label: "hidden-phone replay is already at its complete target",
      row: {
        ...phoneKeyed,
        sourceId: "bsuid-new",
        sourceUserId: "bsuid-new",
        sourceParentUserId: "parent-new",
      },
      matchKind: "current" as const,
      matchedBy: "sourceUserId" as const,
      matchedValue: "bsuid-new",
      change: {
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        parentUserId: "parent-new",
      },
      expectedSet: undefined,
      expectedRecipient: { recipient: "bsuid-new" },
    },
  ])("plans target state: $label", ({
    change,
    expectedRecipient,
    expectedSet,
    matchKind,
    matchedBy,
    matchedValue,
    row,
  }) => {
    const plan = resolveRotationPlan({
      row,
      matchKind,
      matchedBy,
      matchedValue,
      change,
    })

    expect(plan.outcome).toBe(expectedSet ? "apply" : "alreadyApplied")
    if (plan.outcome === "stale") {
      throw new Error("expected a target-state plan")
    }
    const finalIdentity =
      plan.outcome === "apply" ? { ...row, ...plan.set } : row
    if (plan.outcome === "apply") {
      expect(plan.set).toEqual(expectedSet)
    }
    expect(resolveRecipientParamsSemantics(finalIdentity)).toEqual(
      expectedRecipient,
    )
    expect(
      finalIdentity.sourceId === change.userId &&
        finalIdentity.sourceUserId !== change.userId,
    ).toBe(false)
  })

  test.each([
    {
      label: "previous sourceUserId match with a declared previousUserId",
      matchKind: "previous" as const,
      matchedBy: "sourceUserId" as const,
      matchedValue: "bsuid-old",
    },
    {
      label: "current sourceId match",
      matchKind: "current" as const,
      matchedBy: "sourceId" as const,
      matchedValue: "84900000002",
    },
    {
      label: "current sourceUserId match",
      matchKind: "current" as const,
      matchedBy: "sourceUserId" as const,
      matchedValue: "bsuid-new",
    },
    {
      label: "current parent match",
      matchKind: "current" as const,
      matchedBy: "sourceParentUserId" as const,
      matchedValue: "parent-new",
    },
  ])("returns stale first for an unrelated sourceUserId: $label", ({
    matchKind,
    matchedBy,
    matchedValue,
  }) => {
    expect(
      resolveRotationPlan({
        row: {
          ...phoneKeyed,
          sourceId:
            matchedBy === "sourceId" ? matchedValue : phoneKeyed.sourceId,
          sourceParentUserId:
            matchedBy === "sourceParentUserId"
              ? matchedValue
              : phoneKeyed.sourceParentUserId,
          sourceUserId: "bsuid-unrelated",
        },
        matchKind,
        matchedBy,
        matchedValue,
        change: {
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousPhone: "84900000001",
          newPhone: "84900000002",
          previousParentUserId: "parent-old",
          parentUserId: "parent-new",
        },
      }),
    ).toEqual({ outcome: "stale" })
  })

  test("treats a non-null empty sourceUserId as stale on a current match", () => {
    expect(
      resolveRotationPlan({
        row: { ...phoneKeyed, sourceUserId: "" },
        matchKind: "current",
        matchedBy: "sourceParentUserId",
        matchedValue: "parent-old",
        change: {
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
        },
      }),
    ).toEqual({ outcome: "stale" })
  })
})

describe("contactInboxService.rotateScopedUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbFindFirst.mockReset()
    mockFindWithContact.mockReset()
    mockUpdateIdentityGuarded.mockReset()
    mockIsUniqueViolationError.mockReturnValue(false)
  })

  test("rotates a phone-keyed row and updates its parent identity", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
      sourceParentUserId: "parent-new",
    })

    const result = await contactInboxService.rotateScopedUserId({
      inboxId: "inbox-1",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
      previousParentUserId: "parent-old",
      parentUserId: "parent-new",
    })

    expect(result.status).toBe("applied")
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceParentUserId: "parent-old",
          sourceUserId: "bsuid-old",
        },
        set: {
          sourceId: "bsuid-new",
          sourceUserId: "bsuid-new",
          sourceParentUserId: "parent-new",
        },
      }),
      expect.anything(),
    )
  })

  test("does not guard a null stored parent while setting the new parent", async () => {
    const rowWithoutParent = {
      ...phoneKeyed,
      sourceParentUserId: null,
    }
    mockFindWithContact.mockResolvedValueOnce(rowWithoutParent)
    mockUpdateIdentityGuarded.mockImplementationOnce(({ guard, set }) => {
      expect(guard).not.toHaveProperty("sourceParentUserId")
      return {
        ...rowWithoutParent,
        ...set,
        sourceParentUserId: "parent-new",
      }
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        parentUserId: "parent-new",
      }),
    ).resolves.toMatchObject({ status: "applied" })
  })

  test("rewrites sourceId and sourceUserId for a BSUID-keyed row", async () => {
    mockFindWithContact.mockResolvedValueOnce(bsuidKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...bsuidKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    })

    await contactInboxService.rotateScopedUserId({
      inboxId: "inbox-1",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        guard: { sourceId: "bsuid-old", sourceUserId: "bsuid-old" },
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
      }),
      expect.anything(),
    )
  })

  test("updates a phone-keyed row with the new phone and BSUID in one guarded write", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "84900000002",
      sourceUserId: "bsuid-new",
    })

    await contactInboxService.rotateScopedUserId({
      inboxId: "inbox-1",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledTimes(1)
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-old",
        },
        set: {
          sourceId: "84900000002",
          sourceUserId: "bsuid-new",
        },
      }),
      expect.anything(),
    )
  })

  test("rekeys a phone-keyed row to the new BSUID when the new phone is hidden", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
      }),
    ).resolves.toMatchObject({
      status: "applied",
      contactInbox: {
        sourceId: "bsuid-new",
        sourceUserId: "bsuid-new",
      },
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-old",
        },
        set: {
          sourceId: "bsuid-new",
          sourceUserId: "bsuid-new",
        },
      }),
      expect.anything(),
    )
  })

  test("treats a new phone equal to the stored BSUID as hidden", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "bsuid-old",
      }),
    ).resolves.toMatchObject({
      status: "applied",
      contactInbox: {
        sourceId: "bsuid-new",
        sourceUserId: "bsuid-new",
      },
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
      }),
      expect.anything(),
    )
  })

  test("rekeys a phone-keyed row found by sourceUserId when both phones are hidden", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    ).resolves.toMatchObject({
      status: "applied",
      contactInbox: {
        sourceId: "bsuid-new",
        sourceUserId: "bsuid-new",
      },
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-old",
        },
        set: {
          sourceId: "bsuid-new",
          sourceUserId: "bsuid-new",
        },
      }),
      expect.anything(),
    )
  })

  test("treats a hidden-phone replay matched by the new BSUID as already applied", async () => {
    const alreadyApplied = {
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(alreadyApplied)

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
      }),
    ).resolves.toMatchObject({
      status: "alreadyApplied",
      contactInbox: alreadyApplied,
    })

    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("treats a both-phones-hidden replay as already applied without writing", async () => {
    const alreadyApplied = {
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(alreadyApplied)

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    ).resolves.toMatchObject({
      status: "alreadyApplied",
      contactInbox: alreadyApplied,
    })

    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("moves the phone when the BSUID is unchanged but the phone changed", async () => {
    const sameBsuid = { ...phoneKeyed, sourceUserId: "bsuid-new" }
    mockFindWithContact.mockResolvedValueOnce(sameBsuid)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...sameBsuid,
      sourceId: "84900000002",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-new",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toMatchObject({ status: "applied" })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-new",
        },
        set: {
          sourceId: "84900000002",
        },
      }),
      expect.anything(),
    )
  })

  test("finishes phone rotation after D6 already advanced the BSUID", async () => {
    const bsuidAlreadyAdvanced = {
      ...phoneKeyed,
      sourceUserId: "bsuid-new",
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(bsuidAlreadyAdvanced)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...bsuidAlreadyAdvanced,
      sourceId: "84900000002",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toMatchObject({ status: "applied" })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceParentUserId: "parent-old",
        },
        set: {
          sourceId: "84900000002",
        },
      }),
      expect.anything(),
    )
  })

  test("resolves a phone-keyed row by previousPhone when previousUserId is absent", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "84900000002",
      sourceUserId: "bsuid-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toMatchObject({ status: "applied" })

    expect(mockFindWithContact).toHaveBeenCalledWith(
      { where: { inboxId: "inbox-1", sourceId: "84900000001" } },
      expect.anything(),
    )
  })

  test("keeps a BSUID-keyed row keyed by the new BSUID when a new phone is present", async () => {
    mockFindWithContact.mockResolvedValueOnce(bsuidKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...bsuidKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    })

    await contactInboxService.rotateScopedUserId({
      inboxId: "inbox-1",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
      }),
      expect.anything(),
    )
  })

  test("treats a previous-BSUID sourceId with null sourceUserId as BSUID-keyed", async () => {
    const legacyBsuidKeyed = {
      ...bsuidKeyed,
      sourceUserId: null,
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(legacyBsuidKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...legacyBsuidKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    })

    await contactInboxService.rotateScopedUserId({
      inboxId: "inbox-1",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        set: { sourceId: "bsuid-new", sourceUserId: "bsuid-new" },
      }),
      expect.anything(),
    )
  })

  test("probes previous ids before new ids and updates the parent on replay", async () => {
    const alreadyApplied = {
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(alreadyApplied)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...alreadyApplied,
      sourceParentUserId: "parent-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        parentUserId: "parent-new",
      }),
    ).resolves.toMatchObject({ status: "applied" })

    expect(mockFindWithContact.mock.calls.map((call) => call[0].where)).toEqual(
      [
        { inboxId: "inbox-1", sourceUserId: "bsuid-old" },
        { inboxId: "inbox-1", sourceId: "bsuid-old" },
        { inboxId: "inbox-1", sourceParentUserId: "parent-old" },
        { inboxId: "inbox-1", sourceUserId: "bsuid-new" },
      ],
    )
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceParentUserId: "parent-old",
          sourceUserId: "bsuid-new",
        },
        set: { sourceParentUserId: "parent-new" },
      }),
      expect.anything(),
    )
  })

  test("returns notFound when neither previous nor new identities exist", async () => {
    mockFindWithContact.mockResolvedValue(undefined)
    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    ).resolves.toEqual({ status: "notFound" })
  })

  test("returns stale without writing when sourceUserId is unrelated", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...phoneKeyed, sourceUserId: "bsuid-other" })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "84900000001",
        userId: "bsuid-new",
      }),
    ).resolves.toMatchObject({ status: "stale" })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("a later system event after parent-fallback rotation is alreadyApplied", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...phoneKeyed,
        sourceId: "84900000002",
        sourceUserId: "bsuid-new",
      })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toMatchObject({ status: "alreadyApplied" })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("adds a missing parent when the new BSUID lookup is already applied", async () => {
    const alreadyApplied = {
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
      sourceParentUserId: null,
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(alreadyApplied)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...alreadyApplied,
      sourceParentUserId: "parent-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        parentUserId: "parent-new",
      }),
    ).resolves.toMatchObject({
      status: "applied",
      contactInbox: { sourceParentUserId: "parent-new" },
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: { sourceUserId: "bsuid-new" },
        set: { sourceParentUserId: "parent-new" },
      }),
      expect.anything(),
    )
  })

  test("repairs an obsolete phone route and adds the missing parent", async () => {
    const alreadyApplied = {
      ...phoneKeyed,
      sourceUserId: "bsuid-new",
      sourceParentUserId: null,
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(alreadyApplied)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...alreadyApplied,
      sourceId: "bsuid-new",
      sourceParentUserId: "parent-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        parentUserId: "parent-new",
      }),
    ).resolves.toMatchObject({
      status: "applied",
      contactInbox: {
        sourceId: "bsuid-new",
        sourceParentUserId: "parent-new",
      },
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-new",
        },
        set: {
          sourceId: "bsuid-new",
          sourceParentUserId: "parent-new",
        },
      }),
      expect.anything(),
    )
  })

  test("returns stale when only the new parent id matches an unrelated scoped user id", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...phoneKeyed,
        sourceUserId: "bsuid-other",
        sourceParentUserId: "parent-new",
      })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        parentUserId: "parent-new",
      }),
    ).resolves.toMatchObject({ status: "stale" })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("returns stale without a phone transition when the new phone matches an unrelated scoped user id", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...phoneKeyed,
        sourceId: "84900000002",
        sourceUserId: "bsuid-other",
      })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toEqual({
      status: "stale",
      contactInbox: expect.objectContaining({ sourceUserId: "bsuid-other" }),
    })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("returns stale when the new parent matches an unrelated scoped user id and previousUserId is absent", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...phoneKeyed,
        sourceUserId: "bsuid-other",
        sourceParentUserId: "parent-new",
      })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        parentUserId: "parent-new",
      }),
    ).resolves.toEqual({
      status: "stale",
      contactInbox: expect.objectContaining({ sourceUserId: "bsuid-other" }),
    })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("continues a current parent match whose sourceUserId still equals previousUserId", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...phoneKeyed,
        sourceParentUserId: "parent-new",
      })
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
      sourceParentUserId: "parent-new",
    })

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousParentUserId: "parent-old",
        parentUserId: "parent-new",
      }),
    ).resolves.toMatchObject({ status: "applied" })
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledTimes(1)
  })

  test("returns invalid without a new user id or any previous identity", async () => {
    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        userId: "",
        previousPhone: "84900000001",
      }),
    ).resolves.toEqual({ status: "invalid" })
    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        userId: "bsuid-new",
      }),
    ).resolves.toEqual({ status: "invalid" })
    expect(mockFindWithContact).not.toHaveBeenCalled()
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("returns stale when the guarded update affects no row", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce(undefined)
    mockDbFindFirst.mockResolvedValueOnce(phoneKeyed)

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    ).resolves.toMatchObject({ status: "stale" })
  })

  test("logs a conflict with both row ids and completes", async () => {
    const err = new Error("duplicate identity")
    const conflicting = {
      ...phoneKeyed,
      id: "ci-conflict",
      sourceUserId: "bsuid-new",
    }
    mockFindWithContact
      .mockResolvedValueOnce(phoneKeyed)
      .mockResolvedValueOnce(conflicting)
    mockUpdateIdentityGuarded.mockRejectedValueOnce(err)
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === err && constraint === "ContactInbox_inboxId_sourceUserId_key",
    )

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    ).resolves.toMatchObject({ status: "conflict" })
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err,
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        conflictingContactInboxId: "ci-conflict",
        conflictingValue: "bsuid-new",
        constraint: "ContactInbox_inboxId_sourceUserId_key",
      }),
      expect.stringContaining("rotation skipped"),
    )
  })

  test("keeps both rows when a new-phone message wins the ordering race", async () => {
    const err = new Error("new identity already claimed")
    const conflicting = {
      ...phoneKeyed,
      id: "ci-new-message",
      contactId: "contact-2",
      sourceId: "84900000002",
      sourceUserId: "bsuid-new",
      contact: {
        ...contact,
        id: "contact-2",
        phoneNumber: "+84900000002",
      },
    }
    mockFindWithContact
      .mockResolvedValueOnce(phoneKeyed)
      .mockResolvedValueOnce(conflicting)
    mockUpdateIdentityGuarded.mockRejectedValueOnce(err)
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === err && constraint === "ContactInbox_inboxId_sourceId_key",
    )

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toEqual({
      status: "conflict",
      contactInbox: phoneKeyed,
      constraint: "ContactInbox_inboxId_sourceId_key",
    })
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledTimes(1)
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-old",
        },
        set: {
          sourceId: "84900000002",
          sourceUserId: "bsuid-new",
        },
      }),
      expect.anything(),
    )
    expect(mockFindWithContact).toHaveBeenLastCalledWith(
      {
        where: {
          inboxId: "inbox-1",
          sourceId: "84900000002",
        },
      },
      expect.anything(),
    )
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        err,
        inboxId: "inbox-1",
        contactInboxId: "ci-1",
        constraint: "ContactInbox_inboxId_sourceId_key",
        conflictingContactInboxId: "ci-new-message",
        conflictingValue: "84900000002",
      },
      expect.stringContaining("rotation skipped"),
    )
  })

  test("resolves a parent identity conflict through the constraint map", async () => {
    const err = new Error("duplicate parent identity")
    const alreadyApplied = {
      ...phoneKeyed,
      sourceId: "bsuid-new",
      sourceUserId: "bsuid-new",
    }
    const conflicting = {
      ...phoneKeyed,
      id: "ci-parent-conflict",
      sourceParentUserId: "parent-new",
    }
    mockFindWithContact
      .mockResolvedValueOnce(alreadyApplied)
      .mockResolvedValueOnce(conflicting)
    mockUpdateIdentityGuarded.mockRejectedValueOnce(err)
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === err &&
        constraint === "ContactInbox_inboxId_sourceParentUserId_key",
    )

    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        parentUserId: "parent-new",
      }),
    ).resolves.toMatchObject({ status: "conflict" })
    expect(mockFindWithContact).toHaveBeenLastCalledWith(
      {
        where: {
          inboxId: "inbox-1",
          sourceParentUserId: "parent-new",
        },
      },
      expect.anything(),
    )
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("rotation skipped"),
    )
  })

  test("rethrows non-unique database errors", async () => {
    const err = new Error("database unavailable")
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockRejectedValueOnce(err)
    await expect(
      contactInboxService.rotateScopedUserId({
        inboxId: "inbox-1",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    ).rejects.toBe(err)
  })

  test("invalidates tracking tags after an applied write", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceUserId: "bsuid-new",
    })
    await contactInboxService.rotateScopedUserId({
      inboxId: "inbox-1",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
    })
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
  })
})

describe("contactInboxService.changePrimaryPhone", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbFindFirst.mockReset()
    mockFindWithContact.mockReset()
    mockUpdateIdentityGuarded.mockReset()
    mockIsUniqueViolationError.mockReturnValue(false)
  })

  test("moves sourceId on a phone-keyed row with a previous-phone guard", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "84900000002",
    })
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-old",
      }),
    ).resolves.toMatchObject({ status: "applied" })
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: "bsuid-old",
        },
        set: { sourceId: "84900000002" },
      }),
      expect.anything(),
    )
  })

  test("returns stale when a scoped-id backfill wins the phone-change race", async () => {
    const rowWithoutScopedId = { ...phoneKeyed, sourceUserId: null }
    const concurrentlyBackfilled = {
      ...rowWithoutScopedId,
      sourceUserId: "bsuid-concurrent",
    }
    mockFindWithContact.mockResolvedValueOnce(rowWithoutScopedId)
    mockUpdateIdentityGuarded.mockResolvedValueOnce(undefined)
    mockDbFindFirst.mockResolvedValueOnce(concurrentlyBackfilled)

    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-event",
      }),
    ).resolves.toMatchObject({
      status: "stale",
      contactInbox: concurrentlyBackfilled,
    })
    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceUserId: null,
        },
        set: { sourceId: "84900000002" },
      }),
      expect.anything(),
    )
  })

  test("rejects a new phone equal to the stored scoped user id", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)

    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "bsuid-old",
      }),
    ).resolves.toEqual({ status: "invalid" })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("does not rewrite ContactInbox for a BSUID-keyed row", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(bsuidKeyed)
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-old",
      }),
    ).resolves.toMatchObject({ status: "applied", contactInbox: bsuidKeyed })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("does not rewrite ContactInbox when the BSUID is known but sourceId is empty", async () => {
    const bsuidKnownWithoutPhone = { ...phoneKeyed, sourceId: "" }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(bsuidKnownWithoutPhone)

    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-old",
      }),
    ).resolves.toMatchObject({
      status: "applied",
      contactInbox: bsuidKnownWithoutPhone,
    })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("returns alreadyApplied when the BSUID lookup finds the new phone", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...phoneKeyed, sourceId: "84900000002" })
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-old",
      }),
    ).resolves.toMatchObject({ status: "alreadyApplied" })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("returns stale when only the new phone matches an unrelated sourceUserId", async () => {
    const unrelated = {
      ...phoneKeyed,
      sourceId: "84900000002",
      sourceUserId: "bsuid-unrelated",
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(unrelated)

    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-old",
      }),
    ).resolves.toEqual({ status: "stale", contactInbox: unrelated })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("returns stale when the new phone match has an empty non-null sourceUserId", async () => {
    const emptyScopedId = {
      ...phoneKeyed,
      sourceId: "84900000002",
      sourceUserId: "",
    }
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(emptyScopedId)

    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-old",
      }),
    ).resolves.toEqual({ status: "stale", contactInbox: emptyScopedId })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("does not move a phone row carrying an unrelated scoped user id", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-other",
      }),
    ).resolves.toMatchObject({ status: "stale" })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("reports replay, notFound, and invalid changes deterministically", async () => {
    mockFindWithContact
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...phoneKeyed, sourceId: "84900000002" })
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toMatchObject({ status: "alreadyApplied" })

    mockFindWithContact.mockReset().mockResolvedValue(undefined)
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toEqual({ status: "notFound" })

    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "",
        newPhone: "84900000002",
      }),
    ).resolves.toEqual({ status: "invalid" })
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000001",
      }),
    ).resolves.toEqual({ status: "invalid" })
  })

  test("returns conflict for a unique violation", async () => {
    const err = new Error("duplicate phone")
    mockFindWithContact
      .mockResolvedValueOnce(phoneKeyed)
      .mockResolvedValueOnce({ ...phoneKeyed, id: "ci-conflict" })
    mockUpdateIdentityGuarded.mockRejectedValueOnce(err)
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === err && constraint === "ContactInbox_inboxId_sourceId_key",
    )
    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toMatchObject({ status: "conflict" })
  })

  test("returns the current row when the guarded phone update is stale", async () => {
    const current = { ...phoneKeyed, sourceId: "84900000003" }
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce(undefined)
    mockDbFindFirst.mockResolvedValueOnce(current)

    await expect(
      contactInboxService.changePrimaryPhone({
        inboxId: "inbox-1",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    ).resolves.toMatchObject({
      status: "stale",
      contactInbox: current,
    })
  })

  test("invalidates tracking tags after an applied phone write", async () => {
    mockFindWithContact.mockResolvedValueOnce(phoneKeyed)
    mockUpdateIdentityGuarded.mockResolvedValueOnce({
      ...phoneKeyed,
      sourceId: "84900000002",
    })

    await contactInboxService.changePrimaryPhone({
      inboxId: "inbox-1",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })

    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
  })
})
