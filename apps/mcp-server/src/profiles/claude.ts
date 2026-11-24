import {
  type DynamicTool,
  getToolByName,
  getVisibleTools,
} from "../openapi-loader"
import { errorResult, type ToolCallResult } from "../server/execute-tool"
import type { TokenIntrospection } from "../token-introspection"
import { CLAUDE_API_TOOLS } from "./claude-contract"
import {
  CLAUDE_GUIDE_NAMES,
  CLAUDE_GUIDES,
  CLAUDE_INSTRUCTIONS,
  type ClaudeGuideName,
} from "./claude-guides"
import { createDescriptionFilter } from "./description-filter"

export const CLAUDE_PROFILE_INSTRUCTIONS = CLAUDE_INSTRUCTIONS

const CLAUDE_TOOL_NAMES: ReadonlySet<string> = new Set(CLAUDE_API_TOOLS)
const descriptionFilter = createDescriptionFilter(CLAUDE_TOOL_NAMES)

// The spec cache replaces tool objects on refresh, so a stale entry is
// simply never looked up again.
const adaptedTools = new WeakMap<DynamicTool, DynamicTool>()

/**
 * The live tool as this profile serves it. A tool that changes data is
 * always `destructiveHint: true` (the directory's rule, whatever the route
 * metadata says), and its descriptions never name an operation outside the
 * profile.
 */
const adaptTool = (tool: DynamicTool): DynamicTool => {
  const cached = adaptedTools.get(tool)
  if (cached) {
    return cached
  }
  const adapted: DynamicTool = {
    ...tool,
    annotations: {
      ...tool.annotations,
      destructiveHint: !tool.annotations.readOnlyHint,
    },
    description: descriptionFilter.sanitize(tool.description),
    inputSchema: descriptionFilter.cleanSchema(tool.inputSchema),
  }
  adaptedTools.set(tool, adapted)
  return adapted
}

const CLAUDE_GUIDE_TOOL = {
  name: "get_guide",
  annotations: {
    title: "Get guide",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description:
    "Read a ChatbotX usage guide for a workflow: overview and approvals, contacts and pipelines, flows and automation, or inbox handling.",
  inputSchema: {
    type: "object" as const,
    properties: { name: { enum: [...CLAUDE_GUIDE_NAMES], type: "string" } },
    required: ["name"],
  },
}

/** A profile tool by name, or undefined for any name outside the profile. */
export const getClaudeTool = (name: string): DynamicTool | undefined => {
  if (!CLAUDE_TOOL_NAMES.has(name)) {
    return
  }
  const tool = getToolByName(name)
  return tool ? adaptTool(tool) : undefined
}

/**
 * The `tools/list` surface: the profile's operations the calling token may
 * see, plus `get_guide`. No discovery or pass-through tool exists here.
 */
export const listClaudeTools = (introspection: TokenIntrospection | null) => [
  ...getVisibleTools(introspection)
    .filter((tool) => CLAUDE_TOOL_NAMES.has(tool.name))
    .map(adaptTool)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as {
        type: "object"
        [key: string]: unknown
      },
      annotations: tool.annotations,
    })),
  CLAUDE_GUIDE_TOOL,
]

export const claudeGuideResources = () =>
  CLAUDE_GUIDE_NAMES.map((name) => ({
    name,
    uri: `chatbotx://guides/${name}`,
    ...CLAUDE_GUIDES[name],
  }))

export const handleClaudeGuide = (
  args: Record<string, unknown>,
): ToolCallResult => {
  const name = args.name
  if (
    typeof name !== "string" ||
    !CLAUDE_GUIDE_NAMES.includes(name as ClaudeGuideName)
  ) {
    return errorResult(
      `Unknown guide. Use one of: ${CLAUDE_GUIDE_NAMES.join(", ")}`,
    )
  }
  return {
    content: [
      { text: CLAUDE_GUIDES[name as ClaudeGuideName].content, type: "text" },
    ],
  }
}
