import { expect, test } from "vitest"
import { INSTAGRAM_SCOPES } from "../src/apis/auth"

test("Instagram via Facebook requests the content publish scope", () => {
  expect(INSTAGRAM_SCOPES).toContain("instagram_content_publish")
})
