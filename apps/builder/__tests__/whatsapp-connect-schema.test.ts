import { describe, expect, test } from "vitest"
import {
  buildConnectWhatsappSchema,
  connectWhatsappSchema,
} from "@/features/integration-whatsapp/schema"

const BASE = {
  connectExisting: false,
  transferPhoneNumber: false,
  manualConnect: false,
  marketingMessageLite: true,
}

describe("buildConnectWhatsappSchema", () => {
  test("translates the picker's min/max copy for the client form; the server default keeps zod's message", () => {
    const base = {
      connectExisting: true,
      transferPhoneNumber: false,
      manualConnect: false,
      marketingMessageLite: true,
      signupSessionId: "sess-1",
      phoneNumberIds: [],
    }
    const translated = buildConnectWhatsappSchema({
      min: "Select at least 1",
    }).safeParse(base)
    expect(translated.success).toBe(false)
    expect(
      translated.error?.issues.find((issue) =>
        issue.path.includes("phoneNumberIds"),
      )?.message,
    ).toBe("Select at least 1")

    const untranslated = connectWhatsappSchema.safeParse(base)
    expect(untranslated.success).toBe(false)
    expect(
      untranslated.error?.issues.find((issue) =>
        issue.path.includes("phoneNumberIds"),
      )?.message,
    ).not.toBe("Select at least 1")
  })
})

describe("connectWhatsappSchema", () => {
  describe("manual connect", () => {
    test("requires wabaId, accessToken, and a scalar manualPhoneNumberId", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        manualConnect: true,
      })

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toEqual(
        expect.arrayContaining([
          "wabaId",
          "manualPhoneNumberId",
          "accessToken",
        ]),
      )
    })

    test("accepts a fully populated manual request", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        manualConnect: true,
        wabaId: "waba-1",
        accessToken: "token-1",
        manualPhoneNumberId: "phone-1",
      })

      expect(result.success).toBe(true)
    })

    test("rejects an array where manualPhoneNumberId must be a scalar", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        manualConnect: true,
        wabaId: "waba-1",
        accessToken: "token-1",
        manualPhoneNumberId: ["phone-1", "phone-2"],
      })

      expect(result.success).toBe(false)
    })

    test("rejects a signupSessionId sent alongside manual connect", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        manualConnect: true,
        wabaId: "waba-1",
        accessToken: "token-1",
        manualPhoneNumberId: "phone-1",
        signupSessionId: "session-1",
      })

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("signupSessionId")
    })
  })

  describe("session (picker fan-out) path", () => {
    test("requires phoneNumberId when signupSessionId is present", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        signupSessionId: "session-1",
      })

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("phoneNumberId")
    })

    test("accepts a session id paired with exactly one phoneNumberId", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
      })

      expect(result.success).toBe(true)
    })

    test("accepts the exact minimal fan-out payload the picker sends", () => {
      const result = connectWhatsappSchema.safeParse({
        connectExisting: true,
        transferPhoneNumber: false,
        manualConnect: false,
        marketingMessageLite: true,
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
      })

      expect(result.success).toBe(true)
    })

    test("rejects a code sent alongside a signup session", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        code: "oauth-code-1",
      })

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("code")
    })

    test("rejects an accessToken sent alongside a signup session", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        accessToken: "token-1",
      })

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("accessToken")
    })

    test("rejects a wabaId sent alongside a signup session", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        wabaId: "waba-1",
      })

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("wabaId")
    })

    test("rejects a workspaceId sent alongside a signup session", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        workspaceId: "ws-1",
      })

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("workspaceId")
    })
  })

  describe("OAuth dialog path", () => {
    test("requires a code when neither manual nor a signup session is present", () => {
      const result = connectWhatsappSchema.safeParse(BASE)

      expect(result.success).toBe(false)
      if (result.success) {
        return
      }
      const paths = result.error.issues.map((issue) => issue.path.join("."))
      expect(paths).toContain("code")
    })

    test("accepts a bare code", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        code: "oauth-code-1",
      })

      expect(result.success).toBe(true)
    })
  })

  describe("phoneNumberIds — the multi-select picker form field", () => {
    test("20 ids are accepted", () => {
      const ids = Array.from({ length: 20 }, (_, index) => `phone-${index}`)
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        code: "oauth-code-1",
        phoneNumberIds: ids,
      })

      expect(result.success).toBe(true)
    })

    test("21 ids are rejected", () => {
      const ids = Array.from({ length: 21 }, (_, index) => `phone-${index}`)
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        code: "oauth-code-1",
        phoneNumberIds: ids,
      })

      expect(result.success).toBe(false)
    })

    test("duplicate ids are rejected", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        code: "oauth-code-1",
        phoneNumberIds: ["phone-1", "phone-1"],
      })

      expect(result.success).toBe(false)
    })

    test("is optional — absent entirely for the single-number paths", () => {
      const result = connectWhatsappSchema.safeParse({
        ...BASE,
        code: "oauth-code-1",
      })

      expect(result.success).toBe(true)
    })
  })

  describe("picker coexist fields", () => {
    const SESSION = {
      ...BASE,
      signupSessionId: "session-1",
      phoneNumberId: "phone-1",
    }

    test("accepts an empty coexist selection (no row opted in)", () => {
      const result = connectWhatsappSchema.safeParse({
        ...SESSION,
        phoneNumberIds: ["phone-1"],
        coexistPhoneNumberIds: [],
        aiReadsSyncedHistoryPhoneNumberIds: [],
      })

      expect(result.success).toBe(true)
    })

    test("accepts a coexist selection where only one of the syncing rows lets the AI read it", () => {
      const result = connectWhatsappSchema.safeParse({
        ...SESSION,
        phoneNumberIds: ["phone-1", "phone-2"],
        coexistPhoneNumberIds: ["phone-1", "phone-2"],
        aiReadsSyncedHistoryPhoneNumberIds: ["phone-2"],
      })

      expect(result.success).toBe(true)
    })

    test("both fields stay optional — the manual and OAuth paths never send them", () => {
      expect(connectWhatsappSchema.safeParse(SESSION).success).toBe(true)
    })

    test("rejects a non-array value for either per-row opt-in", () => {
      expect(
        connectWhatsappSchema.safeParse({
          ...SESSION,
          aiReadsSyncedHistoryPhoneNumberIds: true,
        }).success,
      ).toBe(false)
      expect(
        connectWhatsappSchema.safeParse({
          ...SESSION,
          coexistPhoneNumberIds: "phone-1",
        }).success,
      ).toBe(false)
    })
  })
})
