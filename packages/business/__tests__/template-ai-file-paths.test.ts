// @vitest-environment node

import { describe, expect, test } from "vitest"

const { isCopyablePath } = await import("../src/template/adapters/ai-files")

describe("isCopyablePath", () => {
  test.each([
    ["an upload", "workspaces/1/ai-files/report.pdf"],
    ["an installed copy", "workspaces/1/ai-files/tpl-9/g2/abc"],
    ["a copy a sync staged", "workspaces/1/ai-files/tpl-9/g2/5:token/abc"],
  ])("%s can be copied", (_label, path) => {
    expect(isCopyablePath(path, "1")).toBe(true)
  })

  test.each([
    ["another workspace", "workspaces/2/ai-files/report.pdf"],
    ["outside ai-files", "workspaces/1/media/report.pdf"],
    ["any other nesting", "workspaces/1/ai-files/a/b/report.pdf"],
  ])("%s cannot", (_label, path) => {
    expect(isCopyablePath(path, "1")).toBe(false)
  })
})
