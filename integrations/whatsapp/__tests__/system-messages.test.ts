import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: mockLogger }))

const { extractIdentityChangePayloads, isSystemMessage } = await import(
  "../src/lib/system-messages"
)

const wrapMessages = (messages: unknown[], phoneNumberId = "phone-1") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: phoneNumberId },
            messages,
          },
        },
      ],
    },
  ],
})

describe("extractIdentityChangePayloads", () => {
  beforeEach(() => vi.clearAllMocks())

  test("normalizes the official user_changed_user_id payload with visible phones", () => {
    expect(
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: "wamid.user-change",
            from: "84900000001",
            type: "system",
            timestamp: "1759000000",
            system: {
              body: "User Customer changed from bsuid-old to bsuid-new",
              type: "user_changed_user_id",
              wa_id: "84900000002",
              user_id: "bsuid-new",
            },
          },
        ]),
      ),
    ).toEqual([
      {
        phoneNumberId: "phone-1",
        messageId: "wamid.user-change",
        timestamp: "1759000000",
        change: {
          kind: "userIdChanged",
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousParentUserId: undefined,
          parentUserId: undefined,
          previousPhone: "84900000001",
          newPhone: "84900000002",
        },
      },
    ])
  })

  test("normalizes the official payload when both phones are hidden", () => {
    expect(
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: "wamid.hidden-phones",
            from: "",
            type: "system",
            system: {
              body: "User Customer changed from bsuid-old to bsuid-new",
              type: "user_changed_user_id",
              wa_id: "",
              user_id: "bsuid-new",
            },
          },
        ]),
      ),
    ).toEqual([
      expect.objectContaining({
        change: {
          kind: "userIdChanged",
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousParentUserId: undefined,
          parentUserId: undefined,
          previousPhone: undefined,
          newPhone: undefined,
        },
      }),
    ])
  })

  test("treats wa_id equal to the new BSUID as a hidden phone", () => {
    const [payload] = extractIdentityChangePayloads(
      wrapMessages([
        {
          id: "wamid.bsuid-as-phone",
          from: "84900000001",
          type: "system",
          system: {
            body: "User Customer changed from bsuid-old to bsuid-new",
            type: "user_changed_user_id",
            wa_id: "bsuid-new",
            user_id: "bsuid-new",
          },
        },
      ]),
    )

    expect(payload?.change).toEqual({
      kind: "userIdChanged",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
      previousParentUserId: undefined,
      parentUserId: undefined,
      previousPhone: "84900000001",
      newPhone: undefined,
    })
  })

  test.each([
    {
      label: "the documented body over messages[].from_user_id",
      message: {
        id: "wamid.from-user-id",
        from_user_id: "bsuid-from-message",
        type: "system",
        system: {
          body: "User Customer changed from bsuid-from-body to bsuid-new",
          type: "user_changed_user_id",
          user_id: "bsuid-new",
        },
      },
      previousUserId: "bsuid-from-body",
    },
    {
      label: "Chatwoot previous_user_id over the body fallback",
      message: {
        id: "wamid.chatwoot",
        from_user_id: "bsuid-from-message",
        from_parent_user_id: "parent-from-message",
        type: "system",
        system: {
          body: "User Customer changed from bsuid-from-body to bsuid-new",
          type: "user_changed_user_id",
          previous_user_id: "bsuid-from-system",
          previous_parent_user_id: "parent-from-system",
          parent_user_id: "parent-new",
          user_id: "bsuid-new",
        },
      },
      previousUserId: "bsuid-from-system",
    },
  ])("prefers $label", ({ message, previousUserId }) => {
    const [payload] = extractIdentityChangePayloads(wrapMessages([message]))

    expect(payload?.change).toMatchObject({
      kind: "userIdChanged",
      previousUserId,
      userId: "bsuid-new",
    })
  })

  test("uses the body when messages[].from_user_id is the new user id", () => {
    const [payload] = extractIdentityChangePayloads(
      wrapMessages([
        {
          id: "wamid.current-from-user-id",
          from_user_id: "bsuid-new",
          type: "system",
          system: {
            body: "User Customer changed from bsuid-old to bsuid-new",
            type: "user_changed_user_id",
            user_id: "bsuid-new",
          },
        },
      ]),
    )

    expect(payload?.change).toMatchObject({
      kind: "userIdChanged",
      previousUserId: "bsuid-old",
    })
  })

  test("uses messages[].from_user_id when the documented sources are absent", () => {
    const [payload] = extractIdentityChangePayloads(
      wrapMessages([
        {
          id: "wamid.from-user-id-fallback",
          from_user_id: "bsuid-old",
          type: "system",
          system: {
            type: "user_changed_user_id",
            user_id: "bsuid-new",
          },
        },
      ]),
    )

    expect(payload?.change).toMatchObject({
      kind: "userIdChanged",
      previousUserId: "bsuid-old",
    })
  })

  test("drops previous-user candidates equal to the new id while keeping other previous identities", () => {
    const [payload] = extractIdentityChangePayloads(
      wrapMessages([
        {
          id: "wamid.equal-candidates",
          from_user_id: "bsuid-new",
          from_parent_user_id: "parent-old",
          type: "system",
          system: {
            body: "User Customer changed from bsuid-new to bsuid-new",
            previous_user_id: "bsuid-new",
            type: "user_changed_user_id",
            user_id: "bsuid-new",
          },
        },
      ]),
    )

    expect(payload?.change).toEqual({
      kind: "userIdChanged",
      previousUserId: undefined,
      userId: "bsuid-new",
      previousParentUserId: "parent-old",
      parentUserId: undefined,
      previousPhone: undefined,
      newPhone: undefined,
    })
  })

  test.each([
    {
      body: "User Customer changed from bsuid-old to bsuid-new",
      label: "the documented format",
    },
    {
      body: "User Name changed from X to Y changed from bsuid-old to bsuid-new",
      label: "a name containing changed-from wording",
    },
    {
      body: "  User Customer changed from bsuid-old to bsuid-new.  ",
      label: "a trailing period and surrounding whitespace",
    },
  ])("parses $label", ({ body }) => {
    const [payload] = extractIdentityChangePayloads(
      wrapMessages([
        {
          id: "wamid.body-format",
          type: "system",
          system: {
            body,
            type: "user_changed_user_id",
            user_id: "bsuid-new",
          },
        },
      ]),
    )

    expect(payload?.change).toMatchObject({ previousUserId: "bsuid-old" })
  })

  test.each([
    "Prefix User Customer changed from bsuid-old to bsuid-new",
    "User Customer changed from bsuid-old to bsuid-new trailing garbage",
  ])("rejects an undocumented body format: %s", (body) => {
    expect(
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: "wamid.invalid-body-format",
            type: "system",
            system: {
              body,
              type: "user_changed_user_id",
              user_id: "bsuid-new",
            },
          },
        ]),
      ),
    ).toEqual([])
  })

  test("uses messages[].from_parent_user_id when the system parent is absent", () => {
    const [payload] = extractIdentityChangePayloads(
      wrapMessages([
        {
          id: "wamid.parent-fallback",
          from_parent_user_id: "parent-old",
          type: "system",
          system: {
            type: "user_changed_user_id",
            user_id: "bsuid-new",
          },
        },
      ]),
    )

    expect(payload?.change).toEqual({
      kind: "userIdChanged",
      previousUserId: undefined,
      userId: "bsuid-new",
      previousParentUserId: "parent-old",
      parentUserId: undefined,
      previousPhone: undefined,
      newPhone: undefined,
    })
  })

  test("ignores a body old id when its parsed new id disagrees with system.user_id", () => {
    expect(
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: "wamid.body-mismatch",
            type: "system",
            system: {
              body: "User Customer changed from bsuid-old to bsuid-other",
              type: "user_changed_user_id",
              user_id: "bsuid-new",
            },
          },
        ]),
      ),
    ).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "wamid.body-mismatch" }),
      expect.stringContaining("skipped"),
    )
  })

  test.each([
    "user_changed_number",
    "customer_changed_number",
  ])("normalizes %s with message.from as the previous phone", (type) => {
    expect(
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: `wamid.${type}`,
            from: "+84900000001",
            from_user_id: "bsuid-1",
            type: "system",
            system: { type, wa_id: "84900000002" },
          },
        ]),
      ),
    ).toEqual([
      {
        phoneNumberId: "phone-1",
        messageId: `wamid.${type}`,
        timestamp: undefined,
        change: {
          kind: "phoneChanged",
          previousPhone: "+84900000001",
          newPhone: "84900000002",
          userId: "bsuid-1",
        },
      },
    ])
  })

  test("skips user_changed_number when wa_id is the scoped user id", () => {
    expect(
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: "wamid.phone-is-bsuid",
            from: "84900000001",
            from_user_id: "bsuid-1",
            type: "system",
            system: {
              type: "user_changed_number",
              wa_id: "bsuid-1",
            },
          },
        ]),
      ),
    ).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "wamid.phone-is-bsuid" }),
      expect.stringContaining("skipped"),
    )
  })

  test.each([
    {
      label: "empty new phone",
      message: {
        id: "wamid.empty",
        from: "84900000001",
        type: "system",
        system: { type: "user_changed_number", wa_id: "" },
      },
    },
    {
      label: "identical phones",
      message: {
        id: "wamid.same-phone",
        from: "84900000001",
        type: "system",
        system: { type: "user_changed_number", wa_id: "84900000001" },
      },
    },
    {
      label: "identical user ids",
      message: {
        id: "wamid.same-user",
        type: "system",
        system: {
          type: "user_changed_user_id",
          previous_user_id: "bsuid-1",
          user_id: "bsuid-1",
        },
      },
    },
    {
      label: "missing new user id",
      message: {
        id: "wamid.missing-user-id",
        type: "system",
        system: {
          body: "User Customer changed from bsuid-old to bsuid-new",
          type: "user_changed_user_id",
        },
      },
    },
    {
      label: "no previous identity",
      message: {
        id: "wamid.no-previous-identity",
        type: "system",
        system: {
          body: "garbage",
          type: "user_changed_user_id",
          user_id: "bsuid-new",
        },
      },
    },
  ])("skips $label and warns with context", ({ message }) => {
    expect(extractIdentityChangePayloads(wrapMessages([message]))).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: message.id,
        phoneNumberId: "phone-1",
      }),
      expect.stringContaining("skipped"),
    )
  })

  test("skips unsupported system types with an info log", () => {
    expect(
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: "wamid.unsupported",
            type: "system",
            system: { type: "business_initiated_payment" },
          },
        ]),
      ),
    ).toEqual([])
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ systemType: "business_initiated_payment" }),
      expect.stringContaining("unsupported"),
    )
  })

  test("skips malformed payloads with zod issues and never throws", () => {
    expect(() =>
      extractIdentityChangePayloads(
        wrapMessages([
          {
            id: "wamid.malformed",
            type: "system",
            system: { type: "user_changed_user_id", user_id: 42 },
          },
        ]),
      ),
    ).not.toThrow()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ issues: expect.any(Array) }),
      expect.stringContaining("malformed"),
    )
  })
})

describe("isSystemMessage", () => {
  test("recognizes only messages with type system", () => {
    expect(isSystemMessage({ type: "system" })).toBe(true)
    expect(isSystemMessage({ type: "text" })).toBe(false)
    expect(isSystemMessage(null)).toBe(false)
  })
})
