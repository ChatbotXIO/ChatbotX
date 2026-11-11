import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { SignInPrompt } from "../src/features/templates/components/sign-in-prompt"

const HREF_ATTRIBUTE = /href="([^"]+)"/

const hrefOf = (callbackUrl: string): string => {
  const html = renderToStaticMarkup(
    <SignInPrompt callbackUrl={callbackUrl} label="Sign in" />,
  )
  return HREF_ATTRIBUTE.exec(html)?.[1]?.replaceAll("&amp;", "&") ?? ""
}

describe("SignInPrompt", () => {
  test.each([
    ["/store"],
    ["/t/abc123"],
    ["/t/template?id=7&key=abc"],
  ])("sends the visitor back to %s after signing in", (callbackUrl) => {
    expect(hrefOf(callbackUrl)).toBe(
      `/auth/sign-in?callbackURL=${encodeURIComponent(callbackUrl)}`,
    )
  })
})
