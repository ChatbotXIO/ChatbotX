// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON references are literal `${...}` text
import { escapeContactValue, interpolate } from "@chatbotx.io/mini-app"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SimpleMarkdown } from "@/features/mini-apps/components/simple-markdown"

const render = (source: string) =>
  renderToStaticMarkup(<SimpleMarkdown source={source} />)

const scope = { forms: { A: { city: "Hanoi" } }, screenId: "A" }

// The path a RichText takes on the web link: the server puts the escaped
// value in, the runner interpolates `${...}`, then renders markdown.
const renderWithValue = (text: string, value: string) => {
  const markdown = { markdown: true }
  return render(
    interpolate(
      text.replace("{{first_name}}", escapeContactValue(value, text, markdown)),
      scope,
    ),
  )
}

describe("SimpleMarkdown", () => {
  it("still renders the author's markdown", () => {
    expect(render("**Hi** [site](https://example.com)")).toBe(
      '<div class="flex flex-col gap-2"><p class="whitespace-pre-wrap"><strong>Hi</strong> <a class="text-[#027eb5] underline" href="https://example.com" rel="noopener noreferrer" target="_blank">site</a></p></div>',
    )
  })

  it("shows a backslash-escaped character as is", () => {
    expect(render("\\*not italic\\*")).toContain("*not italic*")
    expect(render("\\# not a heading")).not.toContain("<h1")
  })
})

describe("contact values in markdown", () => {
  it("shows markdown in a value as plain text", () => {
    const html = renderWithValue(
      "Hi **{{first_name}}**",
      "*An* [x](https://evil.test)",
    )
    expect(html).toContain("<strong>*An* [x](https://evil.test)</strong>")
    expect(html).not.toContain('evil.test"')
    expect(html).not.toContain("<em>")
  })

  it("never evaluates a reference written in a value", () => {
    const html = renderWithValue("Hi {{first_name}}", "${form.city}")
    expect(html).not.toContain("Hanoi")
    expect(html.replaceAll("⁠", "")).toContain("${form.city}")
  })

  it("keeps a nested expression working with quotes in the value", () => {
    const html = renderWithValue(
      "`'Hi {{first_name}} from ' ${form.city}`",
      "O'Neil *",
    )
    expect(html).toContain("Hi O&#x27;Neil * from Hanoi")
  })

  it("does not turn a value into a heading or a list", () => {
    expect(renderWithValue("{{first_name}}", "# Big")).not.toContain("<h1")
    expect(renderWithValue("{{first_name}}", "- item")).not.toContain("<ul")
    expect(renderWithValue("{{first_name}}", "1. item")).not.toContain("<ol")
  })
})
