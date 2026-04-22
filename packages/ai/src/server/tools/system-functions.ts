import { type ToolSet, tool } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { systemFunctionNames } from "../../constants"
import { logger } from "../../logger"

export interface SystemFunctionContext {
  channel?: string
  contactId: string
  conversationId: string
  workspaceId: string
}

export interface SystemFunctionHandoffRequest {
  channel?: string
  contactId: string
  conversationId: string
  metadata?: Record<string, unknown>
  reason: string
  source: "ai_system_tool"
  workspaceId: string
}

export const systemFunctions = [
  {
    id: systemFunctionNames.connectUserToHuman,
    name: systemFunctionNames.connectUserToHuman,
    description:
      "Transfer the current conversation to a human agent. Use only when the user explicitly requests human support, or when the assistant cannot safely resolve the issue after clarification. Ask for confirmation first when intent is ambiguous.",
    inputSchema: z.object({
      reason: z
        .enum([
          "user_requested_human",
          "assistant_cannot_resolve",
          "high_risk_or_sensitive",
        ])
        .describe("The reason for transferring to a human agent"),
      userRequestExcerpt: z
        .string()
        .optional()
        .describe(
          "A short excerpt of the user's request that triggered this handoff",
        ),
      requestedBy: z
        .enum(["user", "agent_policy"])
        .default("user")
        .describe("Who initiated the handoff request"),
      requiresConfirmation: z
        .boolean()
        .default(false)
        .describe("Whether to ask the user for confirmation before handoff"),
    }),
    outputMessage:
      "I'm connecting you to a human agent who can better assist you. Please stay on the line.",
  },
] as const

export function getAISystemTools(
  selectedSystemIds: string[],
  contextGetter?: () => Promise<SystemFunctionContext | null>,
  executeHandoff?: (request: SystemFunctionHandoffRequest) => Promise<void>,
): ToolSet {
  try {
    const tools: ToolSet = {}

    if (selectedSystemIds.length === 0) {
      return tools
    }

    const selectedFunctions = systemFunctions.filter((f) =>
      selectedSystemIds.includes(f.id),
    )

    for (const sysFn of selectedFunctions) {
      tools[sysFn.name] = tool({
        description: sysFn.description,
        inputSchema: sysFn.inputSchema,
        execute: async (args) => {
          if (
            sysFn.id === systemFunctionNames.connectUserToHuman &&
            contextGetter &&
            executeHandoff
          ) {
            const ctx = await contextGetter()
            if (ctx) {
              await executeHandoff({
                workspaceId: ctx.workspaceId,
                conversationId: ctx.conversationId,
                contactId: ctx.contactId,
                reason: args.reason,
                source: "ai_system_tool",
                channel: ctx.channel,
                metadata: {
                  userRequestExcerpt: args.userRequestExcerpt,
                  requestedBy: args.requestedBy,
                },
              }).catch((err: unknown) => {
                const normalizedError = normalizeError(err)
                logger.error(
                  {
                    error: normalizedError,
                    conversationId: ctx.conversationId,
                  },
                  "[ai-package] Handoff execution failed",
                )
              })
            }
          }

          return sysFn.outputMessage
        },
      })
    }
    return tools
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        error: normalizedError,
        selectedSystemIds,
      },
      "[ai-package] getAISystemTools failed",
    )
    return {}
  }
}
