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

    test("substitutes a boolean field storing the literal string false as the false literal, not null", async () => {
      const context = createContext([
        { key: "isVip", type: "boolean", value: "false" },
      ])
      await expect(
        interpolateIntoJavascript("return {{isVip}};", context),
      ).resolves.toBe("return false;")
    })

    test.each([
      "",
      "yes",
      "1",
      "garbage",
    ])("a boolean field with an unparseable stored value %j emits null, not a silent false", async (value) => {
      const context = createContext([{ key: "isVip", type: "boolean", value }])
      await expect(
        interpolateIntoJavascript("return {{isVip}};", context),
      ).resolves.toBe("return null;")
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

    test("a misclassified enclosing quote (an apostrophe in a same-line comment before the real literal) does not let a value escape into executable statements", async () => {
      // Confirmed exploit this test pins: findEnclosingQuote's character
      // scan reads the apostrophe in `/* it's ok */` as an *opening* single
      // quote, so classifyPlaceholderContext misidentifies the active quote
      // as `'` when the placeholder actually sits inside a `"`-delimited
      // literal. Before escapeForQuote escaped all three quote characters
      // unconditionally, escaping only against the (wrong) guessed `'`
      // left the payload's real `"` unescaped, so it closed the actual
      // string early and injected a second, executable statement:
      //   const x = 1; /* it's ok */ return ""; return globalThis.process...
      // Escaping defensively against all three quote characters closes
      // this regardless of which one the heuristic guesses.
      const context = createContext([
        {
          key: "name",
          value: '"; return globalThis.process.exit ? "danger" : "safe"; //',
        },
      ])
      const code = `const x = 1; /* it's ok */ return "{{name}}";`
      const result = await interpolateIntoJavascript(code, context)

      // The payload's quote must be escaped, so the substitution stays a
      // single string and does not introduce a second statement.
      expect(result).toBe(
        'const x = 1; /* it\'s ok */ return "\\"; return globalThis.process.exit ? \\"danger\\" : \\"safe\\"; //";',
      )
      expect(() => new Function(result)).not.toThrow()
      // Executing it must run exactly the original single return statement
      // — nothing from the payload should ever execute as code.
      const fn = new Function(result) as () => unknown
      expect(fn()).toBe(
        '"; return globalThis.process.exit ? "danger" : "safe"; //',
      )
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

    test("a placeholder inside a /regex/ literal is left unresolved rather than let a value break out of it", async () => {
      // Confirmed exploit this test pins: {{name}} inside `/{{name}}/` has
      // no recognized enclosing quote (findEnclosingQuote only knows ", ',
      // `), so it would classify as "bare" and get wrapped in a fresh `"` —
      // which does not close the still-open regex literal, so a value
      // containing `"` breaks out and injects a statement:
      //   const re = /"x/; globalThis.__pwned__=true; //"/;
      // Verified end to end with a real side effect firing before this fix.
      // The fix refuses to classify (an odd count of unescaped `/` on the
      // line is ambiguous — could be a regex or division), leaving the
      // literal `{{name}}` in place, which then fails loudly as invalid
      // regex syntax rather than silently executing.
      const context = createContext([
        { key: "name", value: "x/; globalThis.__pwned__=true; //" },
      ])
      const code = "const re = /{{name}}/;"
      await expect(interpolateIntoJavascript(code, context)).resolves.toBe(code)
    })

    test("plain division on the same line as a bare placeholder is also left unresolved (a safe false positive, not a silent guess)", async () => {
      // An odd count of unescaped `/` on the line is ambiguous by
      // construction — a real division and a regex literal are
      // indistinguishable without a full parse. Refusing here means this
      // authoring pattern fails loudly (a syntax error from the literal
      // {{...}} surviving) rather than risking a wrong guess; documented
      // trade-off, not a bug.
      const context = createContext([{ key: "b", value: "5" }])
      const code = "return a / {{b}};"
      await expect(interpolateIntoJavascript(code, context)).resolves.toBe(code)
    })

    test("an even count of unescaped / on the line (e.g. two real divisions) is not treated as ambiguous", async () => {
      const context = createContext([{ key: "b", value: "5", type: "number" }])
      const code = "const y = 10 / 2 / 5; return {{b}};"
      await expect(interpolateIntoJavascript(code, context)).resolves.toBe(
        "const y = 10 / 2 / 5; return 5;",
      )
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

    test("two adjacent bare placeholders are joined with + instead of producing invalid JS", async () => {
      // Each bare placeholder self-quotes with no separator; without a
      // joiner, two adjacent ones (both string-typed) would produce
      // `return "A""B";`, a SyntaxError.
      const context2 = createContext([
        { key: "a", value: "A" },
        { key: "b", value: "B" },
      ])
      const result = await interpolateIntoJavascript(
        "return {{a}}{{b}};",
        context2,
      )
      expect(result).toBe('return "A"+"B";')
      expect(() => new Function(result)).not.toThrow()
      const fn = new Function(result) as () => unknown
      expect(fn()).toBe("AB")
    })

    test("adjacent bare numeric and string placeholders are joined with +", async () => {
      const context2 = createContext([{ key: "label", value: "items:" }])
      const numericContext = { ...context2, contact }
      numericContext.customFieldsMap.set("count", {
        key: "count",
        type: "number",
        value: "3",
        description: "",
      })
      const result = await interpolateIntoJavascript(
        "return {{label}}{{count}};",
        numericContext,
      )
      expect(result).toBe('return "items:"+3;')
      expect(() => new Function(result)).not.toThrow()
    })

    test("a whole-literal placeholder immediately followed by a bare placeholder is also joined with +", async () => {
      // Regression: joining previously only tracked bare-then-bare
      // adjacency. A "whole-literal" substitution is just as self-quoting
      // as "bare" — `"{{name}}"{{age}}` would otherwise produce `"Ada"25`,
      // two adjacent literal tokens with no operator between them, a
      // SyntaxError.
      const context2 = createContext([{ key: "name", value: "Ada" }])
      context2.customFieldsMap.set("age", {
        key: "age",
        type: "number",
        value: "25",
        description: "",
      })
      const result = await interpolateIntoJavascript(
        'return "{{name}}"{{age}};',
        context2,
      )
      expect(result).toBe('return "Ada"+25;')
      expect(() => new Function(result)).not.toThrow()
    })

    test("a bare placeholder immediately followed by a whole-literal placeholder is also joined with +", async () => {
      const context2 = createContext([{ key: "name", value: "Ada" }])
      context2.customFieldsMap.set("age", {
        key: "age",
        type: "number",
        value: "25",
        description: "",
      })
      const result = await interpolateIntoJavascript(
        'return {{age}}"{{name}}";',
        context2,
      )
      expect(result).toBe('return 25+"Ada";')
      expect(() => new Function(result)).not.toThrow()
    })

    test("two adjacent whole-literal placeholders are also joined with +", async () => {
      const context2 = createContext([
        { key: "a", value: "A" },
        { key: "b", value: "B" },
      ])
      const result = await interpolateIntoJavascript(
        '"{{a}}""{{b}}";',
        context2,
      )
      expect(result).toBe('"A"+"B";')
      expect(() => new Function(result)).not.toThrow()
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

  test("escapes all quote characters (not just the active one), backslashes, a template interpolation marker, and newlines", async () => {
    // escapeForQuote escapes ", ', and ` unconditionally, regardless of
    // which one is "active" at the splice point — that's what keeps a
    // misclassified enclosing quote (see the injection-guard tests below)
    // safe rather than exploitable.
    const dollarBrace = ["$", "{"].join("")
    const trickyValue = `a"b'c\`d\\e${dollarBrace}f}\ng`
    const context = createContext([{ key: "tricky", value: trickyValue }])
    const result = await interpolateIntoJavascript(
      "return `{{tricky}}`;",
      context,
    )
    const expectedEscaped = `a\\"b\\'c\\\`d\\\\e\\${dollarBrace}f}\\ng`
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

  test("raw: always emits a plain quoted string, even for a number-typed field (never the field's own type-aware literal)", async () => {
    const context = createContext([{ key: "age", type: "number", value: "25" }])
    await expect(
      interpolateIntoJavascript('return "{{raw:age}}";', context),
    ).resolves.toBe('return "25";')
  })

  test("raw: falls through to a literal custom field of that exact name when the stripped name doesn't match", async () => {
    // Matches contact-variable.ts's rawCustomFieldResolver.matches, which
    // requires the stripped name to exist before matching, letting an
    // unmatched raw: prefix fall through to later resolvers instead of
    // short-circuiting to "unknown".
    const context = createContext([
      { key: "raw:something", type: "shortText", value: "literal field" },
    ])
    await expect(
      interpolateIntoJavascript('return "{{raw:something}}";', context),
    ).resolves.toBe('return "literal field";')
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
