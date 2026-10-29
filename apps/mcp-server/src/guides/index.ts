import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const guideDirectory = (() => {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  return existsSync(join(moduleDirectory, "overview.md"))
    ? moduleDirectory
    : join(moduleDirectory, "guides")
})()

const guideDefinitions = {
  overview: {
    description: "MCP discovery, approvals, and OAuth checkpoints.",
    fileName: "overview.md",
  },
  "flows-and-automation": {
    description:
      "FlowSpec, publishing, broadcasts, and bulk automation safety.",
    fileName: "flows-and-automation.md",
  },
  "inbox-and-handover": {
    description:
      "Conversation replies, handover, bot control, and connection checkpoints.",
    fileName: "inbox-and-handover.md",
  },
  "contacts-and-pipelines": {
    description:
      "Contact resolution, bulk changes, and pipeline mutation safety.",
    fileName: "contacts-and-pipelines.md",
  },
} as const

export type GuideName = keyof typeof guideDefinitions

export type Guide = {
  content: string
  description: string
  name: GuideName
  uri: `chatbotx://guides/${GuideName}`
}

export const guideNames = Object.keys(guideDefinitions) as GuideName[]

const loadGuide = (name: GuideName): Guide => {
  const definition = guideDefinitions[name]
  const path = join(guideDirectory, definition.fileName)
  try {
    return {
      content: readFileSync(path, "utf8"),
      description: definition.description,
      name,
      uri: `chatbotx://guides/${name}`,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load MCP guide at ${path}: ${reason}`, {
      cause: error,
    })
  }
}

const guides = Object.freeze(
  Object.fromEntries(guideNames.map((name) => [name, loadGuide(name)])),
) as Readonly<Record<GuideName, Guide>>

export const isGuideName = (name: string): name is GuideName =>
  Object.hasOwn(guideDefinitions, name)

export const getGuide = (name: GuideName): Guide => guides[name]
