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
  streamText,
  jsonSchema,
  type ToolSet,
  tool,
} from "ai"
import { logger } from "../../lib/logger"

// Helper function để xử lý text cho images và links
function processTextForImagesAndLinks(text: string): string[] {
  const parts = []
  let lastIndex = 0
  const seenUrls = new Set<string>() // Track URLs to avoid duplicates

  // Handle markdown images
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let match

  while ((match = markdownImageRegex.exec(text)) !== null) {
    // Add text before the image
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index).trim()
      if (textBefore && textBefore.length > 0) {
        parts.push(textBefore)
      }
    }

    // Add the image URL as a separate message (only URL, no emoji) - avoid duplicates
    const imageUrl = match[2].trim()
    if (imageUrl && !seenUrls.has(imageUrl)) {
      seenUrls.add(imageUrl)
      parts.push(imageUrl) // Remove @ prefix as requested
    }

    lastIndex = match.index + match[0].length
  }

  // Handle plain image URLs (not in markdown format)
  const plainImageRegex = /(https:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?)/gi
  let plainMatch
  let plainLastIndex = lastIndex

  while ((plainMatch = plainImageRegex.exec(text)) !== null) {
    // Add text before the image
    if (plainMatch.index > plainLastIndex) {
      const textBefore = text.substring(plainLastIndex, plainMatch.index).trim()
      if (textBefore && textBefore.length > 0) {
        parts.push(textBefore)
      }
    }

    // Add the image URL as a separate message (only URL, no emoji) - avoid duplicates
    const imageUrl = plainMatch[1].trim()
    if (imageUrl && !seenUrls.has(imageUrl)) {
      seenUrls.add(imageUrl)
      parts.push(imageUrl) // Remove @ prefix as requested
    }

    plainLastIndex = plainMatch.index + plainMatch[0].length
  }

  // Handle markdown links (not images)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  let linkMatch
  let linkLastIndex = plainLastIndex

  while ((linkMatch = markdownLinkRegex.exec(text)) !== null) {
    // Add text before the link
    if (linkMatch.index > linkLastIndex) {
      const textBefore = text.substring(linkLastIndex, linkMatch.index).trim()
      if (textBefore && textBefore.length > 0) {
        parts.push(textBefore)
      }
    }

    // Add the link as a separate message (only URL, no emoji) - avoid duplicates
    const linkUrl = linkMatch[2].trim()
    if (linkUrl && !seenUrls.has(linkUrl)) {
      seenUrls.add(linkUrl)
      parts.push(linkUrl) // Remove @ prefix as requested
    }

    linkLastIndex = linkMatch.index + linkMatch[0].length
  }

  // Add remaining text after the last link
  if (linkLastIndex < text.length) {
    const remainingText = text.substring(linkLastIndex).trim()
    if (remainingText && remainingText.length > 0) {
      parts.push(remainingText)
    }
  }

  // If no images or links found, return the original text
  if (parts.length === 0) {
    parts.push(text)
  }

  // Filter out empty parts, standalone icons, and clean up text
  const filteredParts = parts
    .filter(part => {
      const trimmed = part.trim()

      // Remove empty parts
      if (trimmed.length === 0) {
        return false
      }

      // Remove parts that are only whitespace
      if (/^\s*$/.test(trimmed)) {
        return false
      }

      // Remove standalone icons (single emoji or icon characters)
      if (trimmed.length <= 2 && /^[\u{1F300}-\u{1F9FF}]$/u.test(trimmed)) {
        return false
      }

      // Remove parts that are only whitespace or special characters
      if (/^[\s\u{1F300}-\u{1F9FF}]*$/u.test(trimmed)) {
        return false
      }

      // Remove parts that are only emojis and whitespace
      if (/^[\s\u{1F300}-\u{1F9FF}]+$/u.test(trimmed)) {
        return false
      }

      return true
    })
    .map(part => {
      // Clean up text by removing standalone emojis at the beginning/end
      let cleaned = part.trim()

      // Remove leading emojis and whitespace
      cleaned = cleaned.replace(/^[\u{1F300}-\u{1F9FF}\s]+/u, '')

      // Remove trailing emojis and whitespace
      cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}\s]+$/u, '')

      return cleaned.trim()
    })
    .filter(part => {
      // Final filter to ensure no empty parts
      const trimmed = part.trim()
      return trimmed.length > 0 && !/^\s*$/.test(trimmed)
    })

  return filteredParts
}

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

    const result = await streamText({
      model: openai(openaiModel.model),
      system: aiAgent.prompt ?? undefined,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
    })

    // Collect the streamed text and send messages when encountering \n\n or markdown images
    let fullText = ""
    let currentMessage = ""
    let messageCount = 0

    console.log("=== START STREAMING TEXT ===")

    for await (const delta of result.textStream) {
      fullText += delta
      currentMessage += delta
      console.log("Stream delta:", delta)

      // Check if we encounter \n\n (double newline) - this is the primary delimiter
      if (currentMessage.includes('\n\n')) {
        const segments = currentMessage.split('\n\n')

        // Process all complete segments (except the last one which might be incomplete)
        for (let i = 0; i < segments.length - 1; i++) {
          const segment = segments[i].trim()
          if (!segment) continue

          // Process this segment for images and links
          const processedParts = processTextForImagesAndLinks(segment)

          // Send each processed part as a separate message
          for (const part of processedParts) {
            const trimmedPart = part.trim()
            if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
              messageCount++
              console.log(`Sending message ${messageCount}:`, trimmedPart)

              await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
                type: ChatJobAction.SEND_FLOW_STEP,
                data: {
                  conversationId: message.conversationId,
                  flowVersionId: "",
                  step: {
                    id: createId(),
                    message: trimmedPart,
                    stepType: StepType.SEND_TEXT,
                    buttons: [],
                  },
                },
              })
            }
          }
        }

        // Keep the last segment (might be incomplete)
        currentMessage = segments[segments.length - 1]
      }
    }

    // Get tool calls and results
    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults

    console.log("=== FULL TEXT FROM AGENT ===")
    console.log("Full text length:", fullText.length)
    console.log("Full text content:")
    console.log("--- START ---")
    console.log(fullText)
    console.log("--- END ---")
    console.log("Tool calls:", toolCalls)
    console.log("Tool results:", toolResults)
    console.log("Messages sent:", messageCount)

    // Check if we have tool calls but no text response
    if (toolCalls && toolCalls.length > 0 && (!fullText || fullText.length === 0)) {
      console.log("AI made tool calls but no text response. Generating follow-up response...")

      // Create a follow-up message with tool results to force AI to generate text
      const toolResultsText = toolResults.map(result => {
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
      const followUpResult = await streamText({
        model: openai(openaiModel.model),
        system: aiAgent.prompt ?? undefined,
        messages: followUpMessages,
        maxOutputTokens: aiAgent.maxTokens,
        temperature: aiAgent.temperature,
      })

      console.log("=== START FOLLOW-UP STREAMING TEXT ===")


      // Collect the follow-up streamed text and send messages when encountering \n\n or markdown images
      let followUpText = ""
      let followUpCurrentMessage = ""
      let followUpMessageCount = 0

      for await (const delta of followUpResult.textStream) {
        followUpText += delta
        followUpCurrentMessage += delta
        console.log("Follow-up stream delta:", delta)

        // Check if we encounter \n\n (double newline) - this is the primary delimiter
        if (followUpCurrentMessage.includes('\n\n')) {
          const segments = followUpCurrentMessage.split('\n\n')

          // Process all complete segments (except the last one which might be incomplete)
          for (let i = 0; i < segments.length - 1; i++) {
            const segment = segments[i].trim()
            if (!segment) continue

            // Process this segment for images and links
            const processedParts = processTextForImagesAndLinks(segment)

            // Send each processed part as a separate message
            for (const part of processedParts) {
              const trimmedPart = part.trim()
              if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
                followUpMessageCount++
                console.log(`Sending follow-up message ${followUpMessageCount}:`, trimmedPart)

                await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
                  type: ChatJobAction.SEND_FLOW_STEP,
                  data: {
                    conversationId: message.conversationId,
                    flowVersionId: "",
                    step: {
                      id: createId(),
                      message: trimmedPart,
                      stepType: StepType.SEND_TEXT,
                      buttons: [],
                    },
                  },
                })
              }
            }
          }

          // Keep the last segment (might be incomplete)
          followUpCurrentMessage = segments[segments.length - 1]
        }
      }

      // Send any remaining text
      if (followUpCurrentMessage.trim()) {
        // Process remaining text for images and links
        const parts = processTextForImagesAndLinks(followUpCurrentMessage)

        // Send all parts
        for (const part of parts) {
          const trimmedPart = part.trim()
          if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
            followUpMessageCount++
            console.log(`Sending final follow-up message ${followUpMessageCount}:`, trimmedPart)

            await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
              type: ChatJobAction.SEND_FLOW_STEP,
              data: {
                conversationId: message.conversationId,
                flowVersionId: "",
                step: {
                  id: createId(),
                  message: trimmedPart,
                  stepType: StepType.SEND_TEXT,
                  buttons: [],
                },
              },
            })
          }
        }
      }

      console.log("=== FOLLOW-UP FULL TEXT FROM AGENT ===")
      console.log("Follow-up text length:", followUpText.length)
      console.log("Follow-up text content:")
      console.log("--- FOLLOW-UP START ---")
      console.log(followUpText)
      console.log("--- FOLLOW-UP END ---")
      console.log("Follow-up messages sent:", followUpMessageCount)

      if (followUpMessageCount > 0) {
        return true
      }
    }

    // Send any remaining text that didn't end with \n\n
    if (currentMessage.trim()) {
      // Process remaining text for images and links
      const parts = processTextForImagesAndLinks(currentMessage)

      // Send all parts
      for (const part of parts) {
        const trimmedPart = part.trim()
        if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
          messageCount++
          console.log(`Sending final message ${messageCount}:`, trimmedPart)

          await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
            type: ChatJobAction.SEND_FLOW_STEP,
            data: {
              conversationId: message.conversationId,
              flowVersionId: "",
              step: {
                id: createId(),
                message: trimmedPart,
                stepType: StepType.SEND_TEXT,
                buttons: [],
              },
            },
          })
        }
      }
    }

    if (messageCount > 0) {
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

