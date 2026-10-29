import { copyFileSync, mkdirSync } from "node:fs"

const guideFiles = [
  "contacts-and-pipelines.md",
  "flows-and-automation.md",
  "inbox-and-handover.md",
  "overview.md",
]
const sourceDirectory = new URL("../src/guides/", import.meta.url)
const outputDirectory = new URL("../dist/guides/", import.meta.url)

mkdirSync(outputDirectory, { recursive: true })
for (const fileName of guideFiles) {
  copyFileSync(
    new URL(fileName, sourceDirectory),
    new URL(fileName, outputDirectory),
  )
}
