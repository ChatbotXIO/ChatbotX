import { shouldAddressBySourceUserId } from "@chatbotx.io/sdk"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

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

const OLD_PHONE = "84900000001"
const NEW_PHONE = "84900000002"
const OLD_BSUID = "bsuid-old"
const NEW_BSUID = "bsuid-new"
const UNRELATED_BSUID = "bsuid-unrelated"
const OLD_PARENT = "parent-old"
const NEW_PARENT = "parent-new"
const UNRELATED_PARENT = "parent-unrelated"

type IdentityField = "sourceId" | "sourceParentUserId" | "sourceUserId"

type IdentityChangeReason = "parentFallback" | "phoneChanged" | "userIdChanged"

type IdentityHistoryEntry = {
  sourceId: string
  sourceUserId: string | null
  sourceParentUserId: string | null
  changedAt: string
  reason: IdentityChangeReason
}

type IdentityRow = {
  id: string
  inboxId: string
  contactId: string
  sourceId: string
  sourceUserId: string | null
  sourceParentUserId: string | null
  sourceUsername: string | null
  sourceIdentityHistory: IdentityHistoryEntry[] | null
  contact: {
    id: string
    phoneNumber: string | null
    workspaceId: string
  }
}

type IdentitySet = Partial<
  Pick<IdentityRow, "sourceId" | "sourceParentUserId" | "sourceUserId">
>

type Write = {
  before: IdentityRow
  guard: IdentitySet
  set: IdentitySet
  appendIdentityHistory?: {
    changedAt: string
    reason: IdentityChangeReason
  }
  sourceIdentityHistory?: IdentityHistoryEntry[]
}

type UserIdChangedCase = {
  id: string
  eventKind: "userIdChanged"
  row: IdentityRow
  input: {
    previousUserId?: string
    userId: string
    previousParentUserId?: string
    parentUserId?: string
    previousPhone?: string
    newPhone?: string
  }
}

type PhoneChangedCase = {
  id: string
  eventKind: "phoneChanged"
  row: IdentityRow
  input: {
    previousPhone: string
    newPhone: string
    userId?: string
  }
}

type D6Case = {
  id: string
  eventKind: "d6OrdinaryMessage"
  row: IdentityRow
  incomingContact: {
    sourceId: string
    sourceUserId: string
    sourceParentUserId: string
  }
}

type MatrixCase = UserIdChangedCase | PhoneChangedCase | D6Case

type Violation = {
  actual: string
  caseId: string
  expected: string
  invariant: "I1" | "I2" | "I3" | "I4" | "I5" | "I6"
  rootCause: string
}

const contact = {
  id: "contact-1",
  phoneNumber: `+${OLD_PHONE}`,
  workspaceId: "workspace-1",
}

const fullIdentityHistory = Array.from({ length: 10 }, (_, index) => ({
  sourceId: `historical-source-${index}`,
  sourceUserId: null,
  sourceParentUserId: null,
  changedAt: `2026-09-28T04:00:${String(index).padStart(2, "0")}.000Z`,
  reason: "phoneChanged" as const,
}))

const row = (props: {
  sourceId: string
  sourceUserId: string | null
  sourceParentUserId: string | null
}): IdentityRow => ({
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
  sourceUsername: null,
  sourceIdentityHistory: fullIdentityHistory,
  contact,
  ...props,
})

const documentedExclusions = new Set([
  "BSUID-keyed rows require sourceUserId === sourceId",
  "stored scoped ids are never empty strings",
  "phoneChanged wa_id is a phone, never a BSUID",
  "hidden-phone D6 uses sourceId === sourceUserId === new BSUID",
])
const observedExclusions = new Set<string>()

const recordExclusion = (reason: string): void => {
  if (!documentedExclusions.has(reason)) {
    throw new Error(`Undocumented matrix exclusion: ${reason}`)
  }
  observedExclusions.add(reason)
}

const isReachableStoredRow = (candidate: IdentityRow): boolean => {
  if (candidate.sourceUserId === "") {
    recordExclusion("stored scoped ids are never empty strings")
    return false
  }
  if (
    candidate.sourceId.startsWith("bsuid-") &&
    candidate.sourceUserId !== candidate.sourceId
  ) {
    recordExclusion("BSUID-keyed rows require sourceUserId === sourceId")
    return false
  }
  return true
}

const storedRows = [OLD_PHONE, NEW_PHONE, OLD_BSUID, NEW_BSUID, ""]
  .flatMap((sourceId) =>
    [null, OLD_BSUID, NEW_BSUID, UNRELATED_BSUID, ""].flatMap((sourceUserId) =>
      [null, OLD_PARENT, NEW_PARENT, UNRELATED_PARENT].map(
        (sourceParentUserId) =>
          row({ sourceId, sourceUserId, sourceParentUserId }),
      ),
    ),
  )
  .filter(isReachableStoredRow)

const label = (value: string | null | undefined): string => {
  if (value === null) {
    return "null"
  }
  if (value === undefined) {
    return "absent"
  }
  return value === "" ? "empty" : value
}

const userIdChangedCases = storedRows.flatMap((storedRow) =>
  [undefined, OLD_BSUID].flatMap((previousUserId) =>
    [undefined, OLD_PARENT].flatMap((previousParentUserId) =>
      [undefined, "", OLD_PHONE].flatMap((previousPhone) =>
        [undefined, NEW_PHONE].map(
          (newPhone): UserIdChangedCase => ({
            eventKind: "userIdChanged",
            row: storedRow,
            input: {
              previousUserId,
              userId: NEW_BSUID,
              previousParentUserId,
              parentUserId: NEW_PARENT,
              previousPhone,
              newPhone,
            },
            id: [
              "userIdChanged",
              `sid=${label(storedRow.sourceId)}`,
              `suid=${label(storedRow.sourceUserId)}`,
              `spuid=${label(storedRow.sourceParentUserId)}`,
              `prevUid=${label(previousUserId)}`,
              `prevParent=${label(previousParentUserId)}`,
              `prevPhone=${label(previousPhone)}`,
              `newPhone=${label(newPhone)}`,
            ].join("|"),
          }),
        ),
      ),
    ),
  ),
)

recordExclusion("phoneChanged wa_id is a phone, never a BSUID")
const phoneChangedCases = storedRows.flatMap((storedRow) =>
  [undefined, OLD_BSUID, NEW_BSUID].map(
    (userId): PhoneChangedCase => ({
      eventKind: "phoneChanged",
      row: storedRow,
      input: { previousPhone: OLD_PHONE, newPhone: NEW_PHONE, userId },
      id: [
        "phoneChanged",
        `sid=${label(storedRow.sourceId)}`,
        `suid=${label(storedRow.sourceUserId)}`,
        `spuid=${label(storedRow.sourceParentUserId)}`,
        `userId=${label(userId)}`,
      ].join("|"),
    }),
  ),
)

const d6Rows = [
  row({
    sourceId: OLD_PHONE,
    sourceUserId: OLD_BSUID,
    sourceParentUserId: OLD_PARENT,
  }),
  row({
    sourceId: OLD_PHONE,
    sourceUserId: UNRELATED_BSUID,
    sourceParentUserId: OLD_PARENT,
  }),
  row({
    sourceId: OLD_BSUID,
    sourceUserId: OLD_BSUID,
    sourceParentUserId: OLD_PARENT,
  }),
  row({
    sourceId: "",
    sourceUserId: OLD_BSUID,
    sourceParentUserId: OLD_PARENT,
  }),
]

recordExclusion("hidden-phone D6 uses sourceId === sourceUserId === new BSUID")
const d6Cases = d6Rows.flatMap((storedRow) =>
  [
    { sourceId: NEW_PHONE, sourceUserId: NEW_BSUID },
    // Hidden-phone D6 payloads use the new BSUID for both route identities.
    { sourceId: NEW_BSUID, sourceUserId: NEW_BSUID },
  ].map(
    (incoming): D6Case => ({
      eventKind: "d6OrdinaryMessage",
      row: storedRow,
      incomingContact: {
        ...incoming,
        sourceParentUserId: OLD_PARENT,
      },
      id: [
        "d6OrdinaryMessage",
        `sid=${label(storedRow.sourceId)}`,
        `suid=${label(storedRow.sourceUserId)}`,
        `incomingSid=${incoming.sourceId}`,
      ].join("|"),
    }),
  ),
)

const matrixCases: MatrixCase[] = [
  ...userIdChangedCases,
  ...phoneChangedCases,
  ...d6Cases,
]

if (observedExclusions.size !== documentedExclusions.size) {
  throw new Error("Identity-rotation matrix exclusion accounting mismatch")
}

let activeRow: IdentityRow
let writes: Write[]
let matchedWhere: Record<string, unknown> | undefined

const rowMatchesWhere = (
  candidate: IdentityRow,
  where: Record<string, unknown>,
): boolean =>
  Object.entries(where).every(([field, value]) => {
    if (field === "inboxId") {
      return candidate.inboxId === value
    }
    return candidate[field as IdentityField] === value
  })

const installInMemoryRepository = (storedRow: IdentityRow): void => {
  activeRow = { ...storedRow }
  writes = []
  matchedWhere = undefined
  mockFindWithContact.mockImplementation(
    ({ where }: { where: Record<string, unknown> }) => {
      if (!rowMatchesWhere(activeRow, where)) {
        return
      }
      matchedWhere ??= where
      return activeRow
    },
  )
  mockDbFindFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      rowMatchesWhere(activeRow, where) ? activeRow : undefined,
  )
  mockUpdateIdentityGuarded.mockImplementation(
    ({
      appendIdentityHistory,
      guard,
      set,
    }: {
      appendIdentityHistory?: {
        changedAt: string
        reason: IdentityChangeReason
      }
      guard: IdentitySet
      set: IdentitySet
    }) => {
      if (!rowMatchesWhere(activeRow, guard)) {
        return
      }
      const sourceIdentityHistory = appendIdentityHistory
        ? [
            ...(activeRow.sourceIdentityHistory ?? []),
            {
              sourceId: activeRow.sourceId,
              sourceUserId: activeRow.sourceUserId,
              sourceParentUserId: activeRow.sourceParentUserId,
              changedAt: appendIdentityHistory.changedAt,
              reason: appendIdentityHistory.reason,
            },
          ].slice(-10)
        : undefined
      writes.push({
        before: { ...activeRow },
        guard,
        set,
        ...(appendIdentityHistory ? { appendIdentityHistory } : {}),
        ...(sourceIdentityHistory ? { sourceIdentityHistory } : {}),
      })
      activeRow = {
        ...activeRow,
        ...set,
        ...(sourceIdentityHistory ? { sourceIdentityHistory } : {}),
      }
      return activeRow
    },
  )
}

const addViolation = (
  caseViolations: Violation[],
  matrixCase: MatrixCase,
  violation: Omit<Violation, "caseId">,
): void => {
  caseViolations.push({ ...violation, caseId: matrixCase.id })
}

const isBsuid = (value: string): boolean => value.startsWith("bsuid-")

const resolveRecipientParams = (identity: IdentityRow) =>
  shouldAddressBySourceUserId(identity) && identity.sourceUserId
    ? { recipient: identity.sourceUserId }
    : { to: identity.sourceId }

const checkRouting = (
  matrixCase: MatrixCase,
  caseViolations: Violation[],
  phoneChanged: boolean,
): void => {
  const recipient = resolveRecipientParams(activeRow)
  if ("to" in recipient && isBsuid(recipient.to)) {
    addViolation(caseViolations, matrixCase, {
      invariant: "I1",
      rootCause: "a BSUID is emitted in the WhatsApp `to` field",
      expected: "recipient=<BSUID>",
      actual: `to=${recipient.to}`,
    })
  }
  if ("to" in recipient && phoneChanged && recipient.to === OLD_PHONE) {
    addViolation(caseViolations, matrixCase, {
      invariant: "I1",
      rootCause: "the obsolete phone remains the outbound route",
      expected: `to=${NEW_PHONE} or recipient=${NEW_BSUID}`,
      actual: `to=${recipient.to}`,
    })
  }
}

const checkPhoneProposal = (
  matrixCase: MatrixCase,
  caseViolations: Violation[],
  proposedPhone: string | undefined,
): void => {
  if (
    proposedPhone !== undefined &&
    (!proposedPhone || isBsuid(proposedPhone))
  ) {
    addViolation(caseViolations, matrixCase, {
      invariant: "I2",
      rootCause: "Contact.phoneNumber adoption proposes a non-phone identity",
      expected: "a non-empty real phone",
      actual: label(proposedPhone),
    })
  }
}

const checkWriteCas = (
  matrixCase: MatrixCase,
  caseViolations: Violation[],
  eventWrites: Write[],
): void => {
  for (const write of eventWrites) {
    for (const field of ["sourceId", "sourceUserId"] as const) {
      if (
        write.set[field] !== undefined &&
        write.guard[field] !== write.before[field]
      ) {
        addViolation(caseViolations, matrixCase, {
          invariant: "I5",
          rootCause: `CAS guard omits the observed ${field}`,
          expected: `${field}=${label(write.before[field])}`,
          actual: `${field}=${label(write.guard[field])}`,
        })
      }
    }
    if (write.set.sourceParentUserId !== undefined) {
      const expectedParent = write.before.sourceParentUserId
      const actualParent = write.guard.sourceParentUserId
      const parentGuardIsCorrect =
        expectedParent === null
          ? actualParent === undefined
          : actualParent === expectedParent
      if (!parentGuardIsCorrect) {
        addViolation(caseViolations, matrixCase, {
          invariant: "I5",
          rootCause: "parent CAS does not follow the null-backfill rule",
          expected:
            expectedParent === null
              ? "sourceParentUserId absent"
              : `sourceParentUserId=${expectedParent}`,
          actual: `sourceParentUserId=${label(actualParent)}`,
        })
      }
    }
    for (const [field, value] of Object.entries(write.set) as [
      IdentityField,
      string | null,
    ][]) {
      if (write.before[field] === value) {
        addViolation(caseViolations, matrixCase, {
          invariant: "I6",
          rootCause: `write redundantly includes ${field}`,
          expected: `${field} omitted`,
          actual: `${field}=${label(value)}`,
        })
      }
    }
    if (Object.keys(write.set).length === 0) {
      addViolation(caseViolations, matrixCase, {
        invariant: "I6",
        rootCause: "an empty identity write is issued",
        expected: "no repository write",
        actual: "set={}",
      })
    }
  }
}

const expectedReasonByEvent = {
  d6OrdinaryMessage: "parentFallback",
  phoneChanged: "phoneChanged",
  userIdChanged: "userIdChanged",
} as const satisfies Record<MatrixCase["eventKind"], IdentityChangeReason>

const checkHistory = (
  matrixCase: MatrixCase,
  caseViolations: Violation[],
  eventWrites: Write[],
): void => {
  for (const write of eventWrites) {
    const replacesExistingIdentity = (
      ["sourceId", "sourceUserId", "sourceParentUserId"] as const
    ).some((field) => {
      const previousValue = write.before[field]
      const nextValue = write.set[field]
      return (
        Boolean(previousValue) &&
        nextValue !== undefined &&
        nextValue !== previousValue
      )
    })
    const history = write.sourceIdentityHistory
    if (!replacesExistingIdentity) {
      if (write.appendIdentityHistory !== undefined || history !== undefined) {
        addViolation(caseViolations, matrixCase, {
          invariant: "I6",
          rootCause: "a backfill or no-op appends identity history",
          expected: "sourceIdentityHistory omitted",
          actual: JSON.stringify(history),
        })
      }
      continue
    }

    const latest = history?.at(-1)
    const expectedLatest = {
      sourceId: write.before.sourceId,
      sourceUserId: write.before.sourceUserId,
      sourceParentUserId: write.before.sourceParentUserId,
      reason: expectedReasonByEvent[matrixCase.eventKind],
    }
    const expectedHistory = latest
      ? [
          ...(write.before.sourceIdentityHistory ?? []),
          {
            sourceId: expectedLatest.sourceId,
            sourceUserId: expectedLatest.sourceUserId,
            sourceParentUserId: expectedLatest.sourceParentUserId,
            changedAt: latest.changedAt,
            reason: expectedLatest.reason,
          },
        ].slice(-10)
      : undefined
    if (
      !(history && latest) ||
      write.appendIdentityHistory?.reason !== expectedLatest.reason ||
      JSON.stringify(history) !== JSON.stringify(expectedHistory) ||
      Number.isNaN(Date.parse(latest.changedAt))
    ) {
      addViolation(caseViolations, matrixCase, {
        invariant: "I6",
        rootCause: "an applied identity replacement records incorrect history",
        expected: JSON.stringify({ ...expectedLatest, maximumLength: 10 }),
        actual: JSON.stringify(history),
      })
    }
  }
}

const isProtectedUnrelatedMatch = (matrixCase: MatrixCase): boolean => {
  if (matrixCase.row.sourceUserId !== UNRELATED_BSUID || !matchedWhere) {
    return false
  }
  if (matrixCase.eventKind === "d6OrdinaryMessage") {
    return false
  }
  if (matrixCase.eventKind === "phoneChanged") {
    return Boolean(matrixCase.input.userId)
  }
  const matchedField = Object.keys(matchedWhere).find(
    (field) => field !== "inboxId",
  ) as IdentityField | undefined
  const matchedValue = matchedField ? matchedWhere[matchedField] : undefined
  const previousMatch =
    matchedValue === matrixCase.input.previousUserId ||
    matchedValue === matrixCase.input.previousParentUserId ||
    matchedValue === matrixCase.input.previousPhone
  return !previousMatch || Boolean(matrixCase.input.previousUserId)
}

const checkUnrelatedIdentity = (
  matrixCase: MatrixCase,
  caseViolations: Violation[],
  eventWrites: Write[],
  phoneProposal: string | undefined,
): void => {
  if (!isProtectedUnrelatedMatch(matrixCase)) {
    return
  }
  if (eventWrites.length > 0) {
    addViolation(caseViolations, matrixCase, {
      invariant: "I3",
      rootCause: "an unrelated stored sourceUserId is overwritten",
      expected: "no identity write",
      actual: JSON.stringify(eventWrites.map((write) => write.set)),
    })
  }
  if (phoneProposal !== undefined) {
    addViolation(caseViolations, matrixCase, {
      invariant: "I3",
      rootCause: "an unrelated stored sourceUserId receives a phone transition",
      expected: "no phone transition",
      actual: phoneProposal,
    })
  }
}

const runUserIdChanged = async (
  matrixCase: UserIdChangedCase,
  caseViolations: Violation[],
): Promise<void> => {
  const result = await contactInboxService.rotateScopedUserId({
    inboxId: matrixCase.row.inboxId,
    ...matrixCase.input,
  })
  const eventWrites = [...writes]
  const phoneProposal =
    result.status === "applied" || result.status === "alreadyApplied"
      ? result.phoneTransition?.newPhone
      : undefined
  checkWriteCas(matrixCase, caseViolations, eventWrites)
  checkHistory(matrixCase, caseViolations, eventWrites)
  checkPhoneProposal(matrixCase, caseViolations, phoneProposal)
  checkUnrelatedIdentity(matrixCase, caseViolations, eventWrites, phoneProposal)
  if (result.status === "applied" || result.status === "alreadyApplied") {
    checkRouting(matrixCase, caseViolations, Boolean(phoneProposal))
  }
  writes = []
  await contactInboxService.rotateScopedUserId({
    inboxId: matrixCase.row.inboxId,
    ...matrixCase.input,
  })
}

const runPhoneChanged = async (
  matrixCase: PhoneChangedCase,
  caseViolations: Violation[],
): Promise<void> => {
  const result = await contactInboxService.changePrimaryPhone({
    inboxId: matrixCase.row.inboxId,
    ...matrixCase.input,
  })
  const eventWrites = [...writes]
  const phoneProposal =
    result.status === "applied" || result.status === "alreadyApplied"
      ? result.phoneTransition?.newPhone
      : undefined
  checkWriteCas(matrixCase, caseViolations, eventWrites)
  checkHistory(matrixCase, caseViolations, eventWrites)
  checkPhoneProposal(matrixCase, caseViolations, phoneProposal)
  checkUnrelatedIdentity(matrixCase, caseViolations, eventWrites, phoneProposal)
  if (result.status === "applied" || result.status === "alreadyApplied") {
    checkRouting(matrixCase, caseViolations, true)
  }
  writes = []
  await contactInboxService.changePrimaryPhone({
    inboxId: matrixCase.row.inboxId,
    ...matrixCase.input,
  })
}

const runD6 = async (
  matrixCase: D6Case,
  caseViolations: Violation[],
): Promise<void> => {
  const result = await contactInboxService.syncScopedIdentity({
    contactInbox: matrixCase.row,
    incomingContact: matrixCase.incomingContact,
    matchedBy: "sourceParentUserId",
  })
  const eventWrites = [...writes]
  const phoneProposal = result.learnedPrimaryIdentity?.value
  checkWriteCas(matrixCase, caseViolations, eventWrites)
  checkHistory(matrixCase, caseViolations, eventWrites)
  checkPhoneProposal(matrixCase, caseViolations, phoneProposal)
  checkRouting(matrixCase, caseViolations, Boolean(phoneProposal))
  for (const write of eventWrites) {
    if (write.guard.sourceId !== write.before.sourceId) {
      addViolation(caseViolations, matrixCase, {
        invariant: "I5",
        rootCause: "D6 does not always guard the old sourceId",
        expected: `sourceId=${label(write.before.sourceId)}`,
        actual: `sourceId=${label(write.guard.sourceId)}`,
      })
    }
  }
  writes = []
  await contactInboxService.syncScopedIdentity({
    contactInbox: { ...activeRow },
    incomingContact: matrixCase.incomingContact,
    matchedBy: "sourceParentUserId",
  })
}

const allViolations: Violation[] = []

const formatGroupedSummary = (violations: Violation[]): string => {
  const groups = new Map<string, Violation[]>()
  for (const violation of violations) {
    const key = `${violation.invariant}: ${violation.rootCause}`
    groups.set(key, [...(groups.get(key) ?? []), violation])
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const examples = group
        .slice(0, 3)
        .map((violation) => `    ${violation.caseId}`)
        .join("\n")
      return `  ${key}: ${group.length}\n${examples}`
    })
    .slice(0, 20)
    .join("\n")
}

describe(`WhatsApp identity-rotation invariant matrix (${matrixCases.length} production-reachable cases)`, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsUniqueViolationError.mockReturnValue(false)
  })

  test.each(matrixCases)("$id", async (matrixCase) => {
    installInMemoryRepository(matrixCase.row)
    const caseViolations: Violation[] = []
    if (matrixCase.eventKind === "userIdChanged") {
      await runUserIdChanged(matrixCase, caseViolations)
    } else if (matrixCase.eventKind === "phoneChanged") {
      await runPhoneChanged(matrixCase, caseViolations)
    } else {
      await runD6(matrixCase, caseViolations)
    }
    if (writes.length > 0) {
      addViolation(caseViolations, matrixCase, {
        invariant: "I4",
        rootCause: "replaying the production event writes again",
        expected: "no replay write",
        actual: JSON.stringify(writes.map((write) => write.set)),
      })
    }
    if ((activeRow.sourceIdentityHistory?.length ?? 0) > 10) {
      addViolation(caseViolations, matrixCase, {
        invariant: "I6",
        rootCause: "identity history exceeds its retention limit",
        expected: "at most 10 entries",
        actual: String(activeRow.sourceIdentityHistory?.length),
      })
    }
    allViolations.push(...caseViolations)
    expect(caseViolations).toEqual([])
  })

  afterAll(() => {
    if (allViolations.length > 0) {
      throw new Error(
        `${allViolations.length} matrix violations:\n${formatGroupedSummary(allViolations)}`,
      )
    }
  })
})
