import { describe, expect, test } from "vitest"
import {
  checkTemplate,
  DEFAULT_TEMPLATE_LIMITS,
  FeedTemplateError,
  hashtagsOf,
  parseTemplate,
  renderTemplate,
  type TemplateData,
  truncateAtWord,
} from "../src/feed-template"

const data = (): TemplateData =>
  Object.assign(Object.create(null) as Record<string, never>, {
    author: "Lan Nguyễn",
    categories: ["Tin tức", "Food & Drink", "tin tức", "2024", "Công nghệ"],
    content: "Full text",
    date: "2026-03-05T18:30:00Z",
    feed: { title: "Daily" },
    image: "https://example.com/a.jpg",
    link: "https://example.com/post?utm_source=x&id=7&fbclid=abc",
    raw: { "g:price": "19.99 USD", "dc:creator": "Lan" },
    summary: "",
    title: "Hello world",
  })

const render = (template: string, timeZone?: string) =>
  renderTemplate(template, data(), { timeZone })

describe("output and paths", () => {
  test("fills variables and reads namespaced raw keys", () => {
    expect(
      render('{{ title }} by {{ raw["dc:creator"] }} - {{ feed.title }}'),
    ).toBe("Hello world by Lan - Daily")
  })

  test("a missing variable is empty and blank lines collapse", () => {
    expect(
      render(
        "{{ title }}\n{{ summary }}\n\n\n{{ nope }}\n{{ link | remove_utm }}",
      ),
    ).toBe("Hello world\n\nhttps://example.com/post?id=7")
  })

  test("never reads prototype members", () => {
    expect(() => parseTemplate("{{ constructor }}")).toThrow(FeedTemplateError)
    expect(() => parseTemplate("{{ title.__proto__ }}")).toThrow(
      FeedTemplateError,
    )
    const plain: TemplateData = { title: "x" }
    expect(renderTemplate("{{ toString }}|{{ title.length }}", plain)).toBe("|")
  })

  test("string literals may hold braces", () => {
    expect(render('{{ "a }} b" }}')).toBe("a }} b")
  })
})

describe("filters", () => {
  test("truncate is word-safe and counts code points", () => {
    expect(truncateAtWord("one two three four", 10)).toBe("one two…")
    expect(truncateAtWord("short", 10)).toBe("short")
    expect(render("{{ title | truncate: 5 }}")).toBe("Hell…")
  })

  test("hashtags: CamelCase, unicode kept, deduped, digits dropped, capped", () => {
    expect(render("{{ categories | hashtags: 3 }}")).toBe(
      "#TinTức #FoodDrink #CôngNghệ",
    )
    expect(hashtagsOf(["a b", "A B"], 5)).toBe("#AB")
    expect(render("{{ categories | hashtags: 2 }}")).toBe("#TinTức #FoodDrink")
  })

  test("date formats in the workspace time zone", () => {
    expect(
      render('{{ date | date: "%d/%m/%Y %H:%M" }}', "Asia/Ho_Chi_Minh"),
    ).toBe("06/03/2026 01:30")
    expect(render('{{ date | date: "%B %e, %Y" }}', "UTC")).toBe(
      "March 5, 2026",
    )
    expect(render('{{ title | date: "%Y" }}')).toBe("")
  })

  test("default, case, replace, join, size, first, last, strip_html", () => {
    expect(render('{{ summary | default: "n/a" }}')).toBe("n/a")
    expect(render("{{ title | upcase }} {{ title | downcase }}")).toBe(
      "HELLO WORLD hello world",
    )
    expect(render("{{ title | capitalize }}")).toBe("Hello world")
    expect(render('{{ title | replace: "world", "there" }}')).toBe(
      "Hello there",
    )
    expect(
      render(
        "{{ categories | first }}|{{ categories | last }}|{{ categories | size }}",
      ),
    ).toBe("Tin tức|Công nghệ|5")
    expect(render('{{ categories | join: " / " }}')).toContain(
      "Tin tức / Food & Drink",
    )
    expect(
      renderTemplate("{{ x | strip_html }}", {
        x: "<b>Hi</b><script>x()</script> there",
      }),
    ).toBe("Hi there")
  })

  test("remove_utm keeps other query parameters", () => {
    expect(render("{{ link | remove_utm }}")).toBe(
      "https://example.com/post?id=7",
    )
  })
})

describe("conditions", () => {
  test("truthy, else, nesting", () => {
    expect(render("{{#if image}}photo{{else}}text{{/if}}")).toBe("photo")
    expect(render("{{#if summary}}s{{else}}no summary{{/if}}")).toBe(
      "no summary",
    )
    expect(render("{{#if title}}{{#if summary}}A{{else}}B{{/if}}{{/if}}")).toBe(
      "B",
    )
    expect(render("{{#if not summary}}empty{{/if}}")).toBe("empty")
  })

  test("contains is case-insensitive on lists and text; == and !=", () => {
    expect(render('{{#if categories contains "FOOD & DRINK"}}y{{/if}}')).toBe(
      "y",
    )
    expect(render('{{#if title contains "WORLD"}}y{{/if}}')).toBe("y")
    expect(render('{{#if author == "Lan Nguyễn"}}y{{/if}}')).toBe("y")
    expect(render('{{#if author != "Lan Nguyễn"}}y{{else}}n{{/if}}')).toBe("n")
  })
})

describe("errors", () => {
  test("report line and column", () => {
    try {
      parseTemplate("ok\n{{ title | shout }}")
      throw new Error("should not parse")
    } catch (error) {
      expect(error).toBeInstanceOf(FeedTemplateError)
      const failure = error as FeedTemplateError
      expect(failure.code).toBe("unknownFilter")
      expect(failure.line).toBe(2)
      expect(failure.column).toBeGreaterThan(8)
    }
  })

  test.each([
    ["{{ title", "unterminatedTag"],
    ['{{ "abc }}', "unterminatedString"],
    ["{{#if title}}x", "unclosedIf"],
    ["{{/if}}", "strayEnd"],
    ["{{else}}", "strayEnd"],
    ["{{#each x}}{{/each}}", "unknownBlock"],
    ["{{ title | truncate }}", "badFilterArgument"],
    ['{{ title | truncate: "x" }}', "badFilterArgument"],
    ["{{ title | upcase: 1 }}", "badFilterArgument"],
    ["{{ title | truncate: 99999 }}", "badFilterArgument"],
    ["{{ a b }}", "unexpectedToken"],
    ["{{ #if }}", "unexpectedToken"],
  ])("%s -> %s", (source, code) => {
    expect(checkTemplate(source)).toMatchObject({ code, ok: false })
  })

  test("caps: size, nesting, nodes, filters, output", () => {
    expect(checkTemplate("x".repeat(5001))).toMatchObject({ code: "tooLong" })
    expect(
      checkTemplate("{{#if a}}".repeat(5) + "{{/if}}".repeat(5)),
    ).toMatchObject({ code: "tooDeep" })
    expect(checkTemplate("{{ a }}".repeat(301))).toMatchObject({
      code: "tooComplex",
    })
    expect(checkTemplate(`{{ a ${"| upcase ".repeat(9)}}}`)).toMatchObject({
      code: "tooComplex",
    })
    expect(() =>
      renderTemplate("{{ a }}{{ a }}", { a: "x".repeat(15_000) }),
    ).toThrow("too long")
  })

  test("a valid template reports the variables it reads", () => {
    expect(
      checkTemplate('{{ title }} {{#if image}}{{ raw["x"] }}{{/if}}'),
    ).toEqual({
      ok: true,
      variables: ["title", "image", "raw"],
    })
    expect(DEFAULT_TEMPLATE_LIMITS.maxSourceLength).toBe(5000)
  })
})

describe("hostile templates and input", () => {
  test("an empty replace search is a template error", () => {
    expect(() => parseTemplate('{{ title | replace: "", "x" }}')).toThrow(
      FeedTemplateError,
    )
  })

  test("chained replace stops once a value outgrows the output cap", () => {
    const template = `{{ big | ${Array.from({ length: 6 }, () => `replace: "a", "${"a".repeat(100)}"`).join(" | ")} }}`
    const source = { ...data(), big: "a".repeat(2000) } as TemplateData
    try {
      renderTemplate(template, source)
      throw new Error("should not render")
    } catch (error) {
      expect(error).toBeInstanceOf(FeedTemplateError)
      expect((error as FeedTemplateError).code).toBe("outputTooLong")
    }
  })

  test.each([
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
  ])("an inherited member (%s) is an unknown filter", (name) => {
    try {
      parseTemplate(`{{ title | ${name} }}`)
      throw new Error("should not parse")
    } catch (error) {
      expect(error).toBeInstanceOf(FeedTemplateError)
      expect((error as FeedTemplateError).code).toBe("unknownFilter")
    }
  })

  test("strip_html is fast on 2 MB of angle brackets", () => {
    const started = Date.now()
    expect(() =>
      renderTemplate("{{ x | strip_html | truncate: 10 }}", {
        ...data(),
        x: "<".repeat(2_000_000),
      } as TemplateData),
    ).toThrow(FeedTemplateError)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  test("strip_html keeps its meaning", () => {
    expect(
      renderTemplate("{{ x | strip_html }}", {
        ...data(),
        x: "a<script>bad()</script>b<br/>c<p class='x'>d</p> 1 &lt; 2",
      } as TemplateData),
    ).toBe("a b\nc d 1 < 2")
  })

  test("strip_html decodes entities once, not twice", () => {
    expect(
      renderTemplate("{{ x | strip_html }}", {
        ...data(),
        x: "&amp;lt;b&amp;gt; &amp;amp; &lt;i&gt;",
      } as TemplateData),
    ).toBe("&lt;b&gt; &amp; <i>")
  })
})
