import { describe, expect, test } from "vitest"
import { sanitizeWidgetCss } from "@/features/integration-webchat/lib/widget-css"

describe("sanitizeWidgetCss", () => {
  test("leaves ordinary CSS untouched", () => {
    const css = "body { background: #111; } .foo { color: red; }"
    expect(sanitizeWidgetCss(css)).toBe(css)
  })

  test("neutralizes a closing style tag so it can't break out of the element", () => {
    const malicious = "body{}</style><script>alert(1)</script>"
    const sanitized = sanitizeWidgetCss(malicious)

    expect(sanitized).not.toContain("</style>")
    expect(sanitized).toContain("\\3C /style")
  })

  test("neutralizes a case-insensitive and repeated closing tag", () => {
    const malicious = "a{}</STYLE>b{}</Style >c{}</style>"
    const sanitized = sanitizeWidgetCss(malicious)

    expect(sanitized.toLowerCase()).not.toContain("</style")
  })
})
