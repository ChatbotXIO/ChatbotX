import type { ContactModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { formatBotFieldReference } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { BotFieldValue, ContactCustomFieldValue } from "../src/schema"

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

const { interpolateIntoJavascript, resolveJavascriptInput } = await import(
  "../src/javascript-interpolation"
)

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

const createBotFieldsMap = (
  fields: Array<{ id: string; type?: string; value: string | null }>,
) =>
  new Map(
    fields.map((field) => [
      field.id,
      {
        type: field.type ?? "shortText",
        value: field.value,
      } as unknown as BotFieldValue,
    ]),
  )

const createContext = (
  fields: Array<Partial<ContactCustomFieldValue> & { key: string }> = [],
  contactOverrides: Partial<ContactModel> = {},
  botFields: Array<{ id: string; type?: string; value: string | null }> = [],
) => ({
  contact: { ...contact, ...contactOverrides },
  contactInbox: null,
  customFieldsMap: createCustomFieldsMap(fields),
  botFieldsMap: createBotFieldsMap(botFields),
  workspace,
})

/**
 * Runs the two functions exactly the way handleExecuteJavascript composes
 * them: resolve every referenced name to a value, then rewrite the code's
 * placeholders to `input["name"]` for the names that resolved. Returns both
 * the rewritten code and the `input` object the rewritten code depends on,
 * so tests can execute the result the same way the sandbox would.
 */
const runInterpolation = async (
  code: string,
  context: Parameters<typeof resolveJavascriptInput>[1],
) => {
  const resolved = await resolveJavascriptInput(code, context)
  const input: Record<string, unknown> = Object.fromEntries(resolved)
  const rewritten = interpolateIntoJavascript(code, new Set(resolved.keys()))
  return { rewritten, input }
}

/** Executes rewritten code with a given `input` object, as the sandbox does. */
const execute = (
  rewrittenCode: string,
  input: Record<string, unknown>,
): unknown => {
  const fn = new Function("input", `"use strict"; ${rewrittenCode}`) as (
    i: Record<string, unknown>,
  ) => unknown
  return fn(input)
}

describe("interpolateIntoJavascript + resolveJavascriptInput", () => {
  describe("the reported case", () => {
    test("a space-containing custom field name resolves, and a trailing method call still applies to the whole result", async () => {
      const context = createContext([
        { key: "fullname upper", value: "MÁ CHÁN" },
      ])
      const { rewritten, input } = await runInterpolation(
        'return "{{fullname upper}} ".toLowerCase();',
        context,
      )
      // The placeholder sits inside a string literal, so the literal is
      // split and re-joined with `+`, then the whole thing is parenthesized
      // — otherwise `.toLowerCase()` would bind to only the trailing " "
      // segment instead of the full concatenated string (a precedence bug
      // this parenthesization exists specifically to prevent).
      expect(rewritten).toBe(
        'return ("" + input["fullname upper"] + " ").toLowerCase();',
      )
      expect(execute(rewritten, input)).toBe("má chán ")
    })
  })

  describe("placement classification", () => {
    test("bare: rewrites to a direct property access", async () => {
      const context = createContext([{ key: "age", value: "25" }])
      const { rewritten, input } = await runInterpolation(
        "return {{age}} + 1;",
        context,
      )
      expect(rewritten).toBe('return input["age"] + 1;')
      // A shortText-typed field (createCustomFieldsMap's default) stays a
      // raw string, so this is still string concatenation, not numeric
      // addition — the type-coercion cases below cover `number`-typed
      // fields, where the same code produces a numeric result instead.
      expect(execute(rewritten, input)).toBe("251")
    })

    test("whole-literal: the surrounding quotes are dropped entirely, since the property access is already a valid expression", async () => {
      const context = createContext([{ key: "name", value: "Bob" }])
      const { rewritten, input } = await runInterpolation(
        'return "{{name}}";',
        context,
      )
      expect(rewritten).toBe('return input["name"];')
      expect(execute(rewritten, input)).toBe("Bob")
    })

    test("inside a double-quoted literal: the literal is split and joined with +, then parenthesized", async () => {
      const context = createContext([{ key: "name", value: "Bob" }])
      const { rewritten, input } = await runInterpolation(
        'return "hi {{name}}!";',
        context,
      )
      expect(rewritten).toBe('return ("hi " + input["name"] + "!");')
      expect(execute(rewritten, input)).toBe("hi Bob!")
    })

    test("inside a single-quoted literal: same splice, using the same quote character", async () => {
      const context = createContext([{ key: "name", value: "Bob" }])
      const { rewritten, input } = await runInterpolation(
        "return 'hi {{name}}!';",
        context,
      )
      expect(rewritten).toBe("return ('hi ' + input[\"name\"] + '!');")
      expect(execute(rewritten, input)).toBe("hi Bob!")
    })

    test("inside a template literal: splices as an interpolation hole, the idiomatic form", async () => {
      const dollarBrace = ["$", "{"].join("")
      const context = createContext([{ key: "name", value: "Bob" }])
      const { rewritten, input } = await runInterpolation(
        "return `hi {{name}}!`;",
        context,
      )
      expect(rewritten).toBe(`return \`hi ${dollarBrace}input["name"]}!\`;`)
      expect(execute(rewritten, input)).toBe("hi Bob!")
    })

    test("multiple non-adjacent placeholders in the same literal are grouped into one spliced expression", async () => {
      const context = createContext([
        { key: "a", value: "X" },
        { key: "b", value: "Y" },
      ])
      const { rewritten, input } = await runInterpolation(
        'return "{{a}} and {{b}}!";',
        context,
      )
      expect(rewritten).toBe(
        'return ("" + input["a"] + " and " + input["b"] + "!");',
      )
      expect(execute(rewritten, input)).toBe("X and Y!")
    })

    test("multiple adjacent placeholders in a template literal are two separate holes, not a reconstituted marker", async () => {
      const dollarBrace = ["$", "{"].join("")
      const context = createContext([
        { key: "a", value: "X" },
        { key: "b", value: "Y" },
      ])
      const { rewritten, input } = await runInterpolation(
        "return `{{a}}{{b}}`;",
        context,
      )
      expect(rewritten).toBe(
        `return \`${dollarBrace}input["a"]}${dollarBrace}input["b"]}\`;`,
      )
      expect(execute(rewritten, input)).toBe("XY")
    })

    test("a resolved-but-null value rewrites to a property access that evaluates to null at runtime", async () => {
      const context = createContext([
        { key: "plan", value: null as unknown as string },
      ])
      const { rewritten, input } = await runInterpolation(
        'return {{plan}} ?? "fallback";',
        context,
      )
      expect(rewritten).toBe('return input["plan"] ?? "fallback";')
      expect(execute(rewritten, input)).toBe("fallback")
    })

    test("leaves an unknown placeholder as the literal {{...}} text", async () => {
      const context = createContext([])
      const { rewritten } = await runInterpolation(
        'return "{{not_a_field}}";',
        context,
      )
      expect(rewritten).toBe('return "{{not_a_field}}";')
    })

    test("a mix of a known and an unknown placeholder in the same literal only rewrites the known one", async () => {
      const context = createContext([{ key: "a", value: "X" }])
      const { rewritten, input } = await runInterpolation(
        'return "{{a}} and {{unk}}!";',
        context,
      )
      expect(rewritten).toBe('return ("" + input["a"] + " and {{unk}}!");')
      expect(execute(rewritten, input)).toBe("X and {{unk}}!")
    })
  })

  describe("typed custom field coercion", () => {
    test("a number-typed field resolves to a JS number, so arithmetic is numeric rather than string concatenation", async () => {
      const context = createContext([
        { key: "age", type: "number", value: "30" },
      ])
      const { rewritten, input } = await runInterpolation(
        "let age = {{age}}; let addYears = 5; return age + addYears;",
        context,
      )
      expect(input.age).toBe(30)
      expect(execute(rewritten, input)).toBe(35)
    })

    test("a number-typed field with a non-numeric stored value resolves to null", async () => {
      const context = createContext([
        { key: "age", type: "number", value: "not-a-number" },
      ])
      const { input } = await runInterpolation("return {{age}};", context)
      expect(input.age).toBeNull()
    })

    test("a boolean-typed field with value 'true' resolves to true", async () => {
      const context = createContext([
        { key: "subscribed", type: "boolean", value: "true" },
      ])
      const { rewritten, input } = await runInterpolation(
        "return {{subscribed}} && 1;",
        context,
      )
      expect(input.subscribed).toBe(true)
      expect(execute(rewritten, input)).toBe(1)
    })

    test("a boolean-typed field with value 'false' resolves to false", async () => {
      const context = createContext([
        { key: "subscribed", type: "boolean", value: "false" },
      ])
      const { input } = await runInterpolation(
        "return {{subscribed}};",
        context,
      )
      expect(input.subscribed).toBe(false)
    })

    test("a boolean-typed field with an unrecognized stored value resolves to false", async () => {
      const context = createContext([
        { key: "subscribed", type: "boolean", value: "garbage" },
      ])
      const { input } = await runInterpolation(
        "return {{subscribed}};",
        context,
      )
      expect(input.subscribed).toBe(false)
    })

    test("date and datetime-typed fields are left as the raw ISO string, not coerced to a JS Date", async () => {
      const context = createContext([
        { key: "birthday", type: "date", value: "1990-01-01" },
        {
          key: "signedUpAt",
          type: "datetime",
          value: "2024-01-01T00:00:00.000Z",
        },
      ])
      const { input } = await runInterpolation(
        "return {{birthday}} + {{signedUpAt}};",
        context,
      )
      expect(input.birthday).toBe("1990-01-01")
      expect(input.signedUpAt).toBe("2024-01-01T00:00:00.000Z")
    })

    test("shortText, longText, email, and phoneNumber fields remain untouched strings", async () => {
      const context = createContext([
        { key: "notes", type: "longText", value: "42" },
        { key: "contactEmail", type: "email", value: "a@b.com" },
        { key: "mobileNumber", type: "phoneNumber", value: "+15551234567" },
      ])
      const { input } = await runInterpolation(
        "return {{notes}} + {{contactEmail}} + {{mobileNumber}};",
        context,
      )
      expect(input.notes).toBe("42")
      expect(input.contactEmail).toBe("a@b.com")
      expect(input.mobileNumber).toBe("+15551234567")
    })
  })

  describe("bot field resolution", () => {
    test("resolves a bot_field:<id> token to the workspace field's value, typed like a custom field", async () => {
      const context = createContext([], {}, [
        { id: "1", type: "number", value: "42" },
      ])
      const { rewritten, input } = await runInterpolation(
        `return {{${formatBotFieldReference("1")}}} + 1;`,
        context,
      )
      expect(input[formatBotFieldReference("1")]).toBe(42)
      expect(execute(rewritten, input)).toBe(43)
    })

    test("omits an unknown/deleted bot field id from the resolved input, leaving its placeholder literal", async () => {
      const context = createContext([], {}, [
        { id: "1", type: "shortText", value: "known" },
      ])
      const resolved = await resolveJavascriptInput(
        `return {{${formatBotFieldReference("999")}}};`,
        context,
      )
      expect(resolved.has(formatBotFieldReference("999"))).toBe(false)
    })
  })

  describe("no value is ever spliced into source — injection is structurally impossible", () => {
    // These mirror every exploit found across two rounds of review of the
    // prior source-splicing implementation this replaced (a misclassified
    // regex literal, a /* block comment */ breakout, and adjacent
    // template-literal placeholders reconstituting `${`). None of these
    // scenarios are "guarded against" here — they are inapplicable by
    // construction: interpolateIntoJavascript only ever writes the fixed,
    // JSON-stringified *name* of an `input` key into the code. The
    // resolved *value* only ever reaches the sandbox as data (isolated-vm's
    // ExternalCopy), never as source text, so no character it contains can
    // ever be interpreted as JavaScript.

    test("a contact-controlled display name containing quotes and statement text has no effect on the generated code", async () => {
      const context = createContext([], { firstName: 'x"; return "pwned' })
      const { rewritten, input } = await runInterpolation(
        'return "{{first_name}}";',
        context,
      )
      expect(rewritten).toBe('return input["first_name"];')
      expect(rewritten).not.toContain("pwned")
      expect(execute(rewritten, input)).toBe('x"; return "pwned')
    })

    test("a value crafted to close a /regex/ literal has no effect, because no value is ever in the code", async () => {
      const context = createContext([
        { key: "n", value: 'x"/;globalThis.PWNED=1;//' },
      ])
      const { rewritten } = await runInterpolation(
        "const a=1/2, re = /{{n}}/;",
        context,
      )
      expect(rewritten).toBe('const a=1/2, re = /input["n"]/;')
      expect(rewritten).not.toContain("PWNED")
      expect(() => new Function(rewritten)).not.toThrow()
    })

    test("a value crafted to close a /* block comment */ has no effect, because no value is ever in the code", async () => {
      const context = createContext([
        { key: "x", value: "*/globalThis.PWNED=1;/*" },
      ])
      const { rewritten } = await runInterpolation(
        'const a = 1;\n/* note: "{{x}}" */\nreturn a;',
        context,
      )
      expect(rewritten).toBe('const a = 1;\n/* note: input["x"] */\nreturn a;')
      expect(rewritten).not.toContain("PWNED")
      expect(() => new Function(rewritten)).not.toThrow()
    })

    test("a value containing a template interpolation marker has no effect", async () => {
      const dollarBrace = ["$", "{"].join("")
      const context = createContext([
        { key: "payload", value: `${dollarBrace}(()=>{throw 1})()}` },
      ])
      const { rewritten, input } = await runInterpolation(
        "return `{{payload}}`;",
        context,
      )
      // The whole template literal is just the placeholder ("whole-literal"
      // — same as `"{{name}}"` with a `"` — so the backticks are dropped
      // entirely rather than kept with a `${...}` hole inside them).
      expect(rewritten).toBe('return input["payload"];')
      expect(execute(rewritten, input)).toBe(`${dollarBrace}(()=>{throw 1})()}`)
    })

    test("plain division on the same line as a bare placeholder is left unresolved (a safe false positive, not a silent guess)", async () => {
      // An odd count of unescaped `/` on the line is ambiguous by
      // construction — a real division and a regex literal are
      // indistinguishable without a full parse. Refusing here means this
      // authoring pattern fails loudly (a syntax error from the literal
      // {{...}} surviving) rather than risking a wrong splice.
      const context = createContext([{ key: "b", value: "5" }])
      const code = "return a / {{b}};"
      const { rewritten } = await runInterpolation(code, context)
      expect(rewritten).toBe(code)
    })

    test("an even count of unescaped / on the line (e.g. two real divisions) is not treated as ambiguous", async () => {
      const context = createContext([{ key: "b", value: "5" }])
      const { rewritten, input } = await runInterpolation(
        "const y = 10 / 2 / 5; return {{b}};",
        context,
      )
      expect(rewritten).toBe('const y = 10 / 2 / 5; return input["b"];')
      expect(execute(rewritten, input)).toBe("5")
    })
  })

  describe("documented heuristic limit", () => {
    test("a placeholder inside a string literal nested within another literal's expression hole may fail to parse, but never produces contact-exploitable output", async () => {
      // findEnclosingQuote's plain character-toggle scan doesn't distinguish
      // a `"` nested inside a template literal's expression hole from the
      // outer backtick — a heuristic limit, not a full parse. The worst
      // case is a syntax error in the author's own code (a loud, safe
      // failure), never contact data becoming executable, since the only
      // thing ever spliced is the fixed placeholder name.
      const dollarBrace = ["$", "{"].join("")
      const context = createContext([{ key: "name", value: "Bob" }])
      const { rewritten } = await runInterpolation(
        `const x = \`${dollarBrace} "{{name}}" }\`;`,
        context,
      )
      expect(() => new Function(rewritten)).toThrow(SyntaxError)
    })

    test("a placeholder nested in its own backticks inside a template expression still produces syntactically valid code", async () => {
      const dollarBrace = ["$", "{"].join("")
      const context = createContext([{ key: "name", value: "Bob" }])
      const { rewritten, input } = await runInterpolation(
        `return \`Hi ${dollarBrace}\`{{name}}\`}\`;`,
        context,
      )
      expect(() => new Function(rewritten)).not.toThrow()
      expect(execute(rewritten, input)).toBe('Hi input["name"]')
    })
  })

  describe("raw: and coupon: prefixes", () => {
    test("resolves a raw: custom field verbatim (never re-formatted)", async () => {
      const context = createContext([
        { key: "Full Name", type: "longText", value: "Ada Lovelace" },
      ])
      const { rewritten, input } = await runInterpolation(
        'return "{{raw:Full Name}}";',
        context,
      )
      expect(rewritten).toBe('return input["raw:Full Name"];')
      expect(execute(rewritten, input)).toBe("Ada Lovelace")
    })

    test("raw: falls through to a literal custom field of that exact name when the stripped name doesn't match", async () => {
      // Matches contact-variable.ts's rawCustomFieldResolver.matches, which
      // requires the stripped name to exist before matching, letting an
      // unmatched raw: prefix fall through to later resolvers instead of
      // short-circuiting to "unknown".
      const context = createContext([
        { key: "raw:something", type: "shortText", value: "literal field" },
      ])
      const { rewritten, input } = await runInterpolation(
        'return "{{raw:something}}";',
        context,
      )
      expect(rewritten).toBe('return input["raw:something"];')
      expect(execute(rewritten, input)).toBe("literal field")
    })

    test("resolves a coupon: placeholder by merging it into input", async () => {
      mockResolveCouponVariable.mockResolvedValue("HHFgpe")
      const context = createContext([])
      const { rewritten, input } = await runInterpolation(
        'return "{{coupon:11619011544072192}}";',
        context,
      )
      expect(rewritten).toBe('return input["coupon:11619011544072192"];')
      expect(execute(rewritten, input)).toBe("HHFgpe")
    })
  })

  describe("resolveJavascriptInput", () => {
    test("does not include names the code never references", async () => {
      const context = createContext([
        { key: "unused", value: "should not appear" },
      ])
      const resolved = await resolveJavascriptInput("return 1;", context)
      expect(resolved.size).toBe(0)
    })

    test("resolves independent names concurrently rather than sequentially", async () => {
      let concurrent = 0
      let maxConcurrent = 0
      mockResolveCouponVariable.mockImplementation(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((resolve) => setTimeout(resolve, 5))
        concurrent--
        return "code"
      })
      const context = createContext([])
      await resolveJavascriptInput(
        "return {{coupon:a}} + {{coupon:b}} + {{coupon:c}};",
        context,
      )
      expect(maxConcurrent).toBeGreaterThan(1)
    })
  })
})
