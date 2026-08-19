import type { ContactModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ContactCustomFieldValue } from "../src/schema"

const { mockResolveCouponVariable } = vi.hoisted(() => ({
  mockResolveCouponVariable: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: { findBy: vi.fn(), findLatestForContact: vi.fn() },
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/business/contact-locale", () => ({
  languageFromLocale: () => null,
  normalizeStoredTimezone: (value: string | null) => value,
  offsetFromStoredTimezone: () => null,
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  resolveGenderLabel: () => null,
}))

vi.mock("@chatbotx.io/business/workspace-lifecycle/predicates", () => ({
  isWorkspaceScheduledForDeletion: () => false,
}))

vi.mock("@chatbotx.io/business/coupon", () => ({
  couponService: { resolveCouponVariable: mockResolveCouponVariable },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
}))

const { interpolateIntoJavascript } = await import("../src/utils")

beforeEach(() => {
  vi.clearAllMocks()
})

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  firstName: "Ada",
  lastName: null,
  locale: null,
  timezone: "UTC",
} as ContactModel

const workspace = {
  id: "workspace-1",
  timezone: "UTC",
} as WorkspaceModel

const createCustomFieldsMap = (
  fields: Array<Partial<ContactCustomFieldValue> & { key: string }>,
) =>
  new Map(
    fields.map((field) => [
      field.key,
      {
        description: "",
        type: "shortText",
        value: "",
        ...field,
      } as ContactCustomFieldValue,
    ]),
  )

const createContext = (
  fields: Array<Partial<ContactCustomFieldValue> & { key: string }> = [],
) => ({
  contact,
  contactInbox: null,
  customFieldsMap: createCustomFieldsMap(fields),
  workspace,
})

describe("interpolateIntoJavascript", () => {
  describe("the reported case", () => {
    const context = createContext([{ key: "fullname upper", value: "MÁ CHÁN" }])

    test("embedded placeholder with trailing text stays escaped inner text", async () => {
      await expect(
        interpolateIntoJavascript(
          'return "{{fullname upper}} ".toLowerCase();',
          context,
        ),
      ).resolves.toBe('return "MÁ CHÁN ".toLowerCase();')
    })

    test("whole-literal placeholder consumes the quotes without doubling them", async () => {
      await expect(
        interpolateIntoJavascript('return "{{fullname upper}}";', context),
      ).resolves.toBe('return "MÁ CHÁN";')
    })

    test("placeholder inside a template literal does not let a template interpolation marker escape", async () => {
      const dollarBrace = ["$", "{"].join("")
      await expect(
        interpolateIntoJavascript(
          `return \`x ${dollarBrace}"{{fullname upper}}"} y\`;`,
          context,
        ),
      ).resolves.toBe(`return \`x ${dollarBrace}"MÁ CHÁN"} y\`;`)
    })
  })

  describe("type-aware substitution", () => {
    test("substitutes a number field as a bare numeric literal", async () => {
      const context = createContext([
        { key: "age", type: "number", value: "25" },
      ])
      await expect(
        interpolateIntoJavascript("return {{age}} + 1;", context),
      ).resolves.toBe("return 25 + 1;")
    })

    test("substitutes a boolean field as a bare boolean literal", async () => {
      const context = createContext([
        { key: "isVip", type: "boolean", value: "true" },
      ])
      await expect(
        interpolateIntoJavascript("return {{isVip}};", context),
      ).resolves.toBe("return true;")
    })

    test("substitutes a date field as a quoted ISO string, not a Date call", async () => {
      const context = createContext([
        { key: "signupDate", type: "date", value: "2026-07-23T00:00:00.000Z" },
      ])
      await expect(
        interpolateIntoJavascript('return "{{signupDate}}";', context),
      ).resolves.toBe('return "2026-07-23T00:00:00.000Z";')
    })

    test("substitutes a missing value as null", async () => {
      const context = createContext([
        { key: "plan", value: null as unknown as string },
      ])
      await expect(
        interpolateIntoJavascript('return {{plan}} ?? "fallback";', context),
      ).resolves.toBe('return null ?? "fallback";')
    })
  })

  describe("injection guards", () => {
    test("a system field value (e.g. an inbound visitor's display name) cannot break out of its surrounding string literal", async () => {
      // Mirrors the removed handler test's fixture: on Messenger/WhatsApp/
      // webchat, an inbound visitor controls their own display name, which
      // resolves through first_name (a system field), not a custom field.
      const context = {
        ...createContext([]),
        contact: { ...contact, firstName: 'x"; return "pwned' },
      }
      const result = await interpolateIntoJavascript(
        'return "{{first_name}}";',
        context,
      )
      expect(result).toBe('return "x\\"; return \\"pwned";')
      // The unescaped literal `return "pwned` would only appear if the
      // value had broken out of its enclosing string literal.
      expect(result).not.toContain('return "pwned')
    })

    test("a value containing a template expression does not evaluate", async () => {
      const dollarBrace = ["$", "{"].join("")
      const context = createContext([
        { key: "payload", value: `${dollarBrace}(()=>{throw 1})()}` },
      ])
      await expect(
        interpolateIntoJavascript("return `{{payload}}`;", context),
      ).resolves.toBe(`return \`\\${dollarBrace}(()=>{throw 1})()}\`;`)
    })

    test("a number field with a non-numeric stored value emits null, not raw text", async () => {
      const context = createContext([
        { key: "age", type: "number", value: "25; while(1){}" },
      ])
      await expect(
        interpolateIntoJavascript("return {{age}};", context),
      ).resolves.toBe("return null;")
    })

    test("a number field storing NaN emits null", async () => {
      const context = createContext([
        { key: "age", type: "number", value: "NaN" },
      ])
      await expect(
        interpolateIntoJavascript("return {{age}};", context),
      ).resolves.toBe("return null;")
    })

    test("a number field storing an unsafe magnitude emits null", async () => {
      const context = createContext([
        { key: "age", type: "number", value: "1e999" },
      ])
      await expect(
        interpolateIntoJavascript("return {{age}};", context),
      ).resolves.toBe("return null;")
    })
  })

  describe("context classification", () => {
    const context = createContext([{ key: "name", value: "Bob" }])

    test("whole-literal: quotes are consumed and not doubled", async () => {
      await expect(
        interpolateIntoJavascript('return "{{name}}";', context),
      ).resolves.toBe('return "Bob";')
    })

    test("embedded: placeholder inside a larger string keeps the outer quotes", async () => {
      await expect(
        interpolateIntoJavascript('return "hi {{name}}!";', context),
      ).resolves.toBe('return "hi Bob!";')
    })

    test("bare: placeholder outside any literal splices unquoted text", async () => {
      const numericContext = createContext([
        { key: "age", type: "number", value: "25" },
      ])
      await expect(
        interpolateIntoJavascript("return {{age}} + 1;", numericContext),
      ).resolves.toBe("return 25 + 1;")
    })

    test("inside a template literal expression, quoted with a different quote char", async () => {
      const dollarBrace = ["$", "{"].join("")
      await expect(
        interpolateIntoJavascript(
          `return \`Hi ${dollarBrace}"{{name}}"}\`;`,
          context,
        ),
      ).resolves.toBe(`return \`Hi ${dollarBrace}"Bob"}\`;`)
    })

    test("documented limit: a placeholder nested in its own backticks inside a template expression is misread, but the output stays syntactically valid, quoted JS", async () => {
      // The heuristic scans quotes by raw character matching, not real JS
      // grammar, so the inner backtick closing the nested template literal
      // reads as closing the *outer* one instead. The substitution still
      // lands as a properly quoted, syntactically valid string — never
      // unescaped source — it's just quoted with `"` instead of preserving
      // the backtick.
      const dollarBrace = ["$", "{"].join("")
      const nested = `return \`Hi ${dollarBrace}\`{{name}}\`}\`;`
      const expected = `return \`Hi ${dollarBrace}\`"Bob"\`}\`;`
      await expect(interpolateIntoJavascript(nested, context)).resolves.toBe(
        expected,
      )
    })
  })

  test("leaves an unknown placeholder as the literal {{...}}", async () => {
    const context = createContext([])
    await expect(
      interpolateIntoJavascript('return "{{not_a_field}}";', context),
    ).resolves.toBe('return "{{not_a_field}}";')
  })

  test("an escaped quote earlier in the surrounding code does not confuse the enclosing-literal scan", async () => {
    // `"a\\"b"` is a single, complete string literal containing an escaped
    // quote — the scanner must not treat that escaped `"` as closing it
    // early and misreading `{{name}}` as bare.
    const context = createContext([{ key: "name", value: "Bob" }])
    await expect(
      interpolateIntoJavascript(
        'const s = "a\\"b"; return "{{name}}";',
        context,
      ),
    ).resolves.toBe('const s = "a\\"b"; return "Bob";')
  })

  test("escapes quotes, backslashes, backticks, a template interpolation marker, and newlines", async () => {
    const dollarBrace = ["$", "{"].join("")
    const trickyValue = `a"b'c\`d\\e${dollarBrace}f}\ng`
    const context = createContext([{ key: "tricky", value: trickyValue }])
    const result = await interpolateIntoJavascript(
      "return `{{tricky}}`;",
      context,
    )
    const expectedEscaped = `a"b'c\\\`d\\\\e\\${dollarBrace}f}\\ng`
    expect(result).toBe(`return \`${expectedEscaped}\`;`)
  })

  test("resolves a raw: custom field verbatim", async () => {
    const context = createContext([
      { key: "Full Name", type: "longText", value: "Ada Lovelace" },
    ])
    await expect(
      interpolateIntoJavascript('return "{{raw:Full Name}}";', context),
    ).resolves.toBe('return "Ada Lovelace";')
  })

  test("resolves a coupon: placeholder", async () => {
    mockResolveCouponVariable.mockResolvedValue("HHFgpe")
    const context = createContext([])
    await expect(
      interpolateIntoJavascript(
        'return "{{coupon:11619011544072192}}";',
        context,
      ),
    ).resolves.toBe('return "HHFgpe";')
  })
})
