import { existsSync, readdirSync, readFileSync } from "node:fs"

const sourceDirectory = new URL("../src/guides/", import.meta.url)
const outputDirectory = new URL("../dist/guides/", import.meta.url)
const guideFiles = readdirSync(sourceDirectory).filter((fileName) =>
  fileName.endsWith(".md"),
)

for (const fileName of guideFiles) {
  const guide = new URL(fileName, outputDirectory)
  if (!existsSync(guide)) {
    throw new Error(`Packaged MCP guide is missing: ${fileName}`)
  }
  if (!readFileSync(guide, "utf8").startsWith("# ")) {
    throw new Error(`Packaged MCP guide is invalid: ${fileName}`)
  }
}
