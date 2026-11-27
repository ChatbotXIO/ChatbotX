import { existsSync, readFileSync } from "node:fs"

const sourceGuideDefinitions = new URL(
  "../src/guides/index.ts",
  import.meta.url,
)
const outputDirectory = new URL("../dist/guides/", import.meta.url)
const guideFiles = [
  ...readFileSync(sourceGuideDefinitions, "utf8").matchAll(
    /fileName:\s*"([^"]+\.md)"/g,
  ),
].map((match) => match[1])

if (guideFiles.length === 0) {
  throw new Error("No MCP guide file names were found in the guide definitions")
}

for (const fileName of guideFiles) {
  const guide = new URL(fileName, outputDirectory)
  if (!existsSync(guide)) {
    throw new Error(`Packaged MCP guide is missing: ${fileName}`)
  }
  if (!readFileSync(guide, "utf8").startsWith("# ")) {
    throw new Error(`Packaged MCP guide is invalid: ${fileName}`)
  }
}
