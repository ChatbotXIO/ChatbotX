import { existsSync, readFileSync } from "node:fs"

const overviewGuide = new URL("../dist/guides/overview.md", import.meta.url)

if (!existsSync(overviewGuide)) {
  throw new Error("Packaged MCP guides are missing from dist/guides.")
}

if (
  !readFileSync(overviewGuide, "utf8").startsWith("# ChatbotX MCP overview")
) {
  throw new Error("Packaged MCP overview guide is invalid.")
}
