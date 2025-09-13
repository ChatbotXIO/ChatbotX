import { prisma } from "@aha.chat/database"
import {
  type AIAgentModel,
  type AIAgentProvider,
  type AIFileModel,
  type AIFunctionModel,
  type AIMessageRole,
  type AutomatedResponseReply,
  ReplyType,
  SenderType,
} from "@aha.chat/database/types"
import { StepType } from "@aha.chat/flow-config"
import type { OutgoingMessageEntity, SecretTextAuthValue } from "@aha.chat/sdk"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@aha.chat/worker-config"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createId } from "@paralleldrive/cuid2"
import {
  generateText,
  jsonSchema,
  type ToolSet,
  tool,
} from "ai"
import { logger } from "../../lib/logger"

// Helper function để gọi tool thông qua MCP server với JSON-RPC 2.0
async function callMCPTool(
  mcpServerUrl: string,
  toolName: string,
  args: any,
  auth?: any
): Promise<any> {
  try {
    // Tạo JSON-RPC 2.0 request để gọi tool (khớp với CURL request)
    const requestBody = {
      jsonrpc: "2.0",
      id: 3, // Sử dụng ID cố định như trong CURL
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }

    // Chuẩn bị headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    // Thêm authentication headers nếu có
    if (auth) {
      switch (auth.type) {
        case "TOKEN":
          headers.Authorization = `Bearer ${auth.token}`
          break
        case "HEADERS":
          for (const header of auth.headers) {
            headers[header.header] = header.value
          }
          break
        case "NONE":
        default:
          // Không cần thêm headers
          break
      }
    }

    console.log(`Calling MCP tool ${toolName} at ${mcpServerUrl}`)
    console.log("Request body:", JSON.stringify(requestBody, null, 2))

    // Gửi HTTP request đến MCP server
    const response = await fetch(mcpServerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    })

    console.log(`MCP response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
    }

    const result = await response.json()
    console.log("MCP response:", JSON.stringify(result, null, 2))

    // Kiểm tra JSON-RPC 2.0 response format
    if (result.jsonrpc !== "2.0") {
      throw new Error("Invalid JSON-RPC 2.0 response")
    }

    if (result.error) {
      throw new Error(`MCP tool error: ${result.error.message}`)
    }

    // Extract content from MCP response
    let content = result.result?.content || result.result

    // If content is an array, extract text from first item
    if (Array.isArray(content) && content.length > 0) {
      const firstItem = content[0]
      if (firstItem.type === "text" && firstItem.text) {
        content = firstItem.text
      }
    }

    console.log(`MCP tool ${toolName} result content:`, content)

    return {
      content: content,
      success: true,
    }
  } catch (error) {
    console.error(`Error calling MCP tool ${toolName}:`, error)
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
    }
  }
}

type ReplyByOpenAIProps = {
  message: OutgoingMessageEntity
  lastAIMessages: AIMessage[]
  aiAgent: AIAgentModel
  allFiles: AIFileModel[]
  allFunctions: AIFunctionModel[]
}

type AIMessage = {
  role: AIMessageRole
  content: string
}

export const listAllEnabledAutomatedResponses = async ({
  chatbotId,
}: {
  chatbotId: string
}) => {
  try {
    return await prisma.automatedResponse.findMany({
      where: {
        chatbotId,
        status: true,
      },
    })
  } catch (err) {
    logger.error("Unable to list automated responses", err)
    return []
  }
}

export async function triggerAutomatedResponse({
  message,
}: {
  message: OutgoingMessageEntity
}) {
  if (!message.content) {
    return
  }

  if (await replyByAutomatedResponse({ message })) {
    return
  }

  const aiAgent = await prisma.aIAgent.findFirst({
    where: {
      chatbotId: message.chatbotId,
      isDefault: true,
    },
  })
  if (!aiAgent) {
    return
  }

  const last100Messages = await prisma.message.findMany({
    where: {
      conversationId: message.conversationId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  })
  const lastAIMessages: AIMessage[] = []
  for (const msg of last100Messages) {
    if (!msg.content) {
      continue
    }
    if (msg.senderType === SenderType.CONTACT) {
      lastAIMessages.push({
        role: "user",
        content: msg.content,
      })
    } else if (
      msg.senderType === SenderType.USER ||
      msg.senderType === SenderType.BOT
    ) {
      lastAIMessages.push({
        role: "assistant",
        content: msg.content,
      })
    }
  }
  lastAIMessages.reverse()

  const allFiles = await prisma.aIFile.findMany({
    where: {
      chatbotId: message.chatbotId,
    },
  })
  const allFunctions = await prisma.aIFunction.findMany({
    where: {
      chatbotId: message.chatbotId,
    },
  })

  if (
    await replyByOpenAI({
      message,
      lastAIMessages,
      aiAgent,
      allFiles,
      allFunctions,
    })
  ) {
    return
  }

  if (
    await replyByGemini({
      message,
      lastAIMessages,
      aiAgent,
      allFiles,
      allFunctions,
    })
  ) {
    return
  }
}

async function replyByAutomatedResponse({
  message,
}: {
  message: OutgoingMessageEntity
}): Promise<boolean> {
  let replied = false

  const allAutomatedResponses = await listAllEnabledAutomatedResponses({
    chatbotId: message.chatbotId,
  })
  if (allAutomatedResponses.length === 0) {
    return false
  }

  for (const automatedResponse of allAutomatedResponses) {
    const matched = automatedResponse.userMessages.some((v) =>
      (message.content ?? "").includes(v),
    )
    if (matched) {
      for (const reply of automatedResponse.replies as AutomatedResponseReply[]) {
        switch (reply.type) {
          case ReplyType.MESSAGE:
            await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
              type: ChatJobAction.SEND_FLOW_STEP,
              data: {
                conversationId: message.conversationId,
                flowVersionId: "",
                step: {
                  id: createId(),
                  message: reply.message,
                  stepType: StepType.SEND_TEXT,
                  buttons: [],
                },
              },
            })
            replied = true
            break

          case ReplyType.FLOW:
            await integrationQueue.add(IntegrationJobAction.SEND_FLOW, {
              type: IntegrationJobAction.SEND_FLOW,
              data: {
                conversationId: message.conversationId,
                flowId: reply.flowId,
              },
            })
            replied = true
            break

          default:
            break
        }
      }
    }
  }

  return replied
}

async function replyByGemini({
  message,
  lastAIMessages,
  aiAgent,
  allFiles,
  allFunctions,
}: ReplyByOpenAIProps): Promise<boolean> {
  const integrationGemini = await prisma.integrationGemini.findFirst({
    where: {
      chatbotId: message.chatbotId,
      autoReply: true,
    },
  })
  if (!integrationGemini) {
    return false
  }

  const gemini = createGoogleGenerativeAI({
    apiKey: (integrationGemini.auth as SecretTextAuthValue | null)?.secretText,
  })

  const geminiModel = (aiAgent.models as AIAgentProvider[]).find(
    (v) => v.provider === "gemini",
  )
  if (!geminiModel) {
    return false
  }

  const { text } = await generateText({
    model: gemini(geminiModel.model),
    system: aiAgent.prompt ?? undefined,
    messages: lastAIMessages,
    maxOutputTokens: aiAgent.maxTokens,
    temperature: aiAgent.temperature,
  })

  await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
    type: ChatJobAction.SEND_FLOW_STEP,
    data: {
      conversationId: message.conversationId,
      flowVersionId: "",
      step: {
        id: createId(),
        message: text,
        stepType: StepType.SEND_TEXT,
        buttons: [],
      },
    },
  })

  return true
}

async function replyByOpenAI({
  message,
  lastAIMessages,
  aiAgent,
  allFiles,
  allFunctions,
}: ReplyByOpenAIProps): Promise<boolean> {
  try {
    const integrationOpenAI = await prisma.integrationOpenAI.findFirst({
      where: {
        chatbotId: message.chatbotId,
        autoReply: true,
      },
    })
    if (!integrationOpenAI) {
      return false
    }

    const openai = createOpenAI({
      apiKey: (integrationOpenAI.auth as SecretTextAuthValue | null)
        ?.secretText,
    })

    const openaiModel = (aiAgent.models as AIAgentProvider[]).find(
      (v) => v.provider === "openAI",
    )
    if (!openaiModel) {
      return false
    }

    const tools = await getSelectedTools(aiAgent)
    console.log("Selected tools:", Object.keys(tools))

    const output = await generateText({
      model: openai(openaiModel.model),
      system: aiAgent.prompt ?? undefined,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
    })

    console.log("OpenAI output:", JSON.stringify(output, null, 2))
    console.log("Tool calls:", output.toolCalls)
    console.log("Tool results:", output.toolResults)
    console.log("Output text length:", output.text?.length || 0)
    console.log("Output text:", output.text)

    // Check if we have tool calls but no text response
    if (output.toolCalls && output.toolCalls.length > 0 && (!output.text || output.text.length === 0)) {
      console.log("AI made tool calls but no text response. Generating follow-up response...")

      // Create a follow-up message with tool results to force AI to generate text
      const toolResultsText = output.toolResults.map(result => {
        return `Tool ${result.toolName} result: ${result.output}`
      }).join('\n\n')

      const followUpMessages = [
        ...lastAIMessages,
        {
          role: "assistant" as const,
          content: "I've found some information for you:",
        },
        {
          role: "user" as const,
          content: `Please analyze this data and provide a helpful response in Vietnamese: ${toolResultsText}`,
        },
      ]

      console.log("Generating follow-up response...")
      const followUpOutput = await generateText({
        model: openai(openaiModel.model),
        system: aiAgent.prompt ?? undefined,
        messages: followUpMessages,
        maxOutputTokens: aiAgent.maxTokens,
        temperature: aiAgent.temperature,
      })

      console.log("Follow-up output:", followUpOutput.text)

      if (followUpOutput.text && followUpOutput.text.length > 0) {
        await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
          type: ChatJobAction.SEND_FLOW_STEP,
          data: {
            conversationId: message.conversationId,
            flowVersionId: "",
            step: {
              id: createId(),
              message: followUpOutput.text,
              stepType: StepType.SEND_TEXT,
              buttons: [],
            },
          },
        })
        return true
      }
    }

    if (output.text && output.text.length > 0) {
      await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
        type: ChatJobAction.SEND_FLOW_STEP,
        data: {
          conversationId: message.conversationId,
          flowVersionId: "",
          step: {
            id: createId(),
            message: output.text,
            stepType: StepType.SEND_TEXT,
            buttons: [],
          },
        },
      })

      return true
    }

    return false
  } catch (error) {
    console.error("Error in replyByOpenAI:", error)
    return false
  }
}

async function getSelectedTools(aiAgent: AIAgentModel): Promise<ToolSet> {
  try {
    const selectedMCPs = aiAgent.tools
      .filter((v) => v.startsWith("mcp:"))
      .map((v) => v.split(":")[1])
      .filter(Boolean)

    if (selectedMCPs.length === 0) {
      return {}
    }

    const mcpServers = await prisma.aIMCPServer.findMany({
      where: {
        chatbotId: aiAgent.chatbotId,
        id: { in: selectedMCPs },
      },
    })

    if (mcpServers.length === 0) {
      return {}
    }

    const tools: ToolSet = {}

    for (const mcpServer of mcpServers) {
      try {
        const availableTools = mcpServer.availableTools as Record<
          string,
          {
            description: string
            inputSchema: { jsonSchema: unknown }
          }
        >

        if (!availableTools || typeof availableTools !== "object") {
          continue
        }

        for (const toolName of mcpServer.selectedTools) {
          const toolDef = availableTools[toolName]
          if (!toolDef) {
            continue
          }

          const uniqueToolName = `${mcpServer.name}_${toolName}`

          try {
            tools[uniqueToolName] = tool({
              description: `${toolDef.description} (from ${mcpServer.name})`,
              inputSchema: jsonSchema(toolDef.inputSchema.jsonSchema as any),
              execute: async (args) => {
                try {
                  console.log(`Executing MCP tool ${toolName} with args:`, JSON.stringify(args, null, 2))

                  // Gọi tool thông qua MCP server với JSON-RPC 2.0
                  const result = await callMCPTool(mcpServer.url, toolName, args, mcpServer.auth)

                  // Return the content directly for AI to use
                  console.log(`MCP tool ${toolName} result:`, result)
                  return result.content || result
                } catch (error) {
                  console.error(`Error executing MCP tool ${toolName}:`, error)
                  return `Error: ${error instanceof Error ? error.message : "Unknown error"}`
                }
              },
            })
          } catch (_schemaError) { }
        }
      } catch (_error) { }
    }

    return tools
  } catch (_error) {
    return {}
  }
}

