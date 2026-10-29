import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const resolveGuideDirectory = (moduleUrl: string): string => {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl))
  const sourceGuideDirectory = join(moduleDirectory, "overview.md")
  return existsSync(sourceGuideDirectory)
    ? moduleDirectory
    : join(moduleDirectory, "guides")
}

const guideDirectory = resolveGuideDirectory(import.meta.url)

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

export const isGuideName = (name: string): name is GuideName =>
  Object.hasOwn(guideDefinitions, name)

export const getGuide = (name: GuideName): Guide => {
  const definition = guideDefinitions[name]
  return {
    content: readFileSync(join(guideDirectory, definition.fileName), "utf8"),
    description: definition.description,
    name,
    uri: `chatbotx://guides/${name}`,
  }
}
