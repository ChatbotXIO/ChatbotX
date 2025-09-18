import { prisma } from "@aha.chat/database"
import {
  type AIAgentModel,
  type AIAgentProvider,
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
import { streamText, jsonSchema, type ToolSet, tool } from "ai"
import { logger } from "../../lib/logger"

const TEXT = {
  assistantFoundPrefix: "I've found some information for you:",
  followUpUserInstruction:
    "Dựa trên kết quả tìm kiếm sản phẩm, hãy giới thiệu chi tiết các sản phẩm phù hợp cho khách hàng với hình ảnh và mô tả hấp dẫn. Kết quả tìm kiếm:",
  fileSearchNoResult: "Không tìm thấy file nào phù hợp với từ khóa tìm kiếm.",
  fileSearchErrorPrefix: "Lỗi khi tìm kiếm file:",
  fileSearchFoundPrefix: (count: number) => `Tìm thấy ${count} file(s) phù hợp:`,
  foundProductsFallbackPrefix:
    "Dạ em đã tìm thấy một số sản phẩm phù hợp cho {{gender}}:",
} as const

const PROMPT = {
  system: {
    header: "QUY TẮC HỆ THỐNG (bắt buộc, không được bỏ qua):",
    rules: [
      "1) Tuyệt đối không bịa đặt thông tin. Chỉ trả lời dựa trên dữ liệu có thật từ tools (file_search, custom functions, MCP) hoặc nội dung người dùng cung cấp.",
      "2) Nếu chưa tìm thấy dữ liệu phù hợp sau khi tra cứu tools, hãy nói lịch sự là hiện chưa đủ thông tin để tư vấn chính xác và đề nghị {{gender}} mô tả thêm nhu cầu. Không tự tạo danh sách sản phẩm.",
      "3) Khi có dữ liệu sản phẩm hợp lệ, có thể gợi ý tối đa 4 sản phẩm, mỗi sản phẩm ngắn gọn, rõ ràng, ưu tiên gạch đầu dòng, kèm link/hình ảnh nếu có trong dữ liệu.",
      "4) Ưu tiên gọi tool phù hợp trước khi trả lời. Không suy đoán nếu tool không trả ra dữ liệu.",
    ],
  },
  tools: {
    requiredHeader: "**QUY TẮC BẮT BUỘC:**",
    requiredRules: [
      "- MỖI TIN NHẮN PHẢI CÓ ÍT NHẤT 1 FUNCTION CALL",
      "- KHÔNG BAO GIỜ trả lời mà không gọi function",
    ],
    usageHeader: "**HƯỚNG DẪN SỬ DỤNG TOOLS:**",
    fileSearch: [
      "1. **file_search**: BẮT BUỘC sử dụng cho mọi câu hỏi về sản phẩm, chính sách, thông tin công ty",
      "   - LUÔN LUÔN gọi file_search ngay khi khách bắt đầu chat",
      "   - Sử dụng để tìm kiếm thông tin trong các file đã upload",
    ],
    customFunctionsLabel: (names: string[]) =>
      `2. **Custom Functions**: Sử dụng các function được định nghĩa sẵn\n   - Các function có sẵn: ${names.join(", ")}\n   - Mỗi function có mục đích và tham số riêng`,
    mcpToolsLabel: (names: string[]) =>
      `3. **MCP Tools**: Sử dụng cho các tác vụ đặc biệt\n   - Các tool có sẵn: ${names.join(", ")}\n   - Mỗi tool có chức năng chuyên biệt từ server bên ngoài`,
    weatherHint: "4. **get_weather**: Cung cấp thông tin thời tiết để tư vấn trang phục phù hợp",
    finalHeader: "**QUY TẮC QUAN TRỌNG:**",
    finalRules: [
      "- Nếu không có dữ liệu: Vẫn phải gọi function trước, sau đó mới nói không có dữ liệu",
      "- Luôn cố gắng tạo trải nghiệm tốt nhất cho khách hàng!",
    ],
  },
} as const

const ROLES = {
  user: "user" as const,
  assistant: "assistant" as const,
  system: "system" as const,
}
type RoleValue = typeof ROLES[keyof typeof ROLES]

const TOOL_PREFIX = {
  file: "file:",
  fn: "fn:",
  mcp: "mcp:",
} as const

const JSON_TYPE = {
  object: "object",
  string: "string",
  number: "number",
  integer: "integer",
  boolean: "boolean",
  array: "array",
  null: "null",
} as const
type JsonType = typeof JSON_TYPE[keyof typeof JSON_TYPE]


function parseSelectedIdsFromTools(all: readonly string[], prefix: string): string[] {
  return all
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length))
    .filter((id) => Boolean(id))
}

function renderMessageContent(raw: string): string {
  let html = raw.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt, url) => {
    const safeAlt = String(alt ?? "").trim()
    const safeUrl = String(url ?? "").trim()
    return `<img src="${safeUrl}" alt="${safeAlt}" />`
  })

  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text, url) => {
    const safeText = String(text ?? "").trim()
    const safeUrl = String(url ?? "").trim()
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeText}</a>`
  })

  return html
}

// Split text and extract image/link URLs into separate parts
function processTextForImagesAndLinks(text: string): string[] {
  const parts: string[] = []
  const seenUrls = new Set<string>()

  const cleanText = (t: string): string => {
    let s = String(t ?? "")
    s = s.replace(/^[\-*]\s*/u, "")
    s = s.replace(/^[[\]()]+|[[\]()]+$/g, "")
    s = s.trim()
    return s
  }

  const urlRegex = /(https?:\/\/[^\s\]\)]+(?:\?[^\s\]\)]*)?)/gi

  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = cleanText(text.slice(lastIndex, match.index))
      if (before) parts.push(before)
    }

    const url = match[1].trim()
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url)
      parts.push(url)
    }

    lastIndex = match.index + match[0].length
  }

  const tail = cleanText(text.slice(lastIndex))
  if (tail) parts.push(tail)

  return parts.filter((p) => {
    const t = p.trim()
    if (!t) return false
    if (/^\s*$/.test(t)) return false
    if (/^[\u{1F300}-\u{1F9FF}]+$/u.test(t)) return false
    return true
  })
}

// Call an MCP server tool via JSON-RPC 2.0
async function callMCPTool(
  mcpServerUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  auth?: any
): Promise<any> {
  try {
    const requestId = Date.now() + Math.floor(Math.random() * 1000)
    const requestBody = {
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

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
          // No extra headers
          break
      }
    }

    console.log(`[MCP] tool=${toolName} url=${mcpServerUrl}`)

    const response = await fetch(mcpServerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
    }

    const result = await response.json()

    // Validate JSON-RPC 2.0 response
    if (result.jsonrpc !== "2.0") {
      throw new Error("Invalid JSON-RPC 2.0 response")
    }

    if (result.error) {
      throw new Error(`MCP tool error: ${result.error.message}`)
    }

    let content = result.result?.content || result.result

    // If content is an array, extract text from first item
    if (Array.isArray(content) && content.length > 0) {
      const firstItem = content[0]
      if (firstItem.type === "text" && firstItem.text) {
        content = firstItem.text
      }
    }

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
  tools: ToolSet
  availableTools: {
    fileTools: string[]
    functionTools: string[]
    mcpTools: string[]
  }
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
        role: ROLES.user,
        content: msg.content,
      })
    } else if (
      msg.senderType === SenderType.USER ||
      msg.senderType === SenderType.BOT
    ) {
      lastAIMessages.push({
        role: ROLES.assistant,
        content: msg.content,
      })
    }
  }
  lastAIMessages.reverse()

  // Build tools once and pass down
  const { tools, availableTools } = await getSelectedTools(aiAgent)
  console.log("🔧 [TOOLS] Tools:", tools)
  console.log("🔧 [TOOLS] Available tools:", availableTools)

  if (
    await replyByOpenAI({
      message,
      lastAIMessages,
      aiAgent,
      tools,
      availableTools,
    })
  ) {
    return
  }

  if (
    await replyByGemini({
      message,
      lastAIMessages,
      aiAgent,
      tools,
      availableTools,
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
  tools,
  availableTools,
}: ReplyByOpenAIProps): Promise<boolean> {
  try {
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

    // Generate dynamic prompt
    const completePrompt = generateCompletePrompt(aiAgent.prompt, availableTools)
    // Keep prompt details out of logs

    // Use streamText for Gemini to support tools and streaming
    const result = await streamText({
      model: gemini(geminiModel.model),
      system: completePrompt,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
    })

    // Process streaming text using common function
    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      message.conversationId,
      { sendParts: false }
    )

    // Get tool calls and results
    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults

    // 1) Tool calls used
    console.log("[AGENT] Tool calls:", (toolCalls || []).map((t: any) => t.toolName || t.name))
    // 2) Full assistant message
    console.log("[AGENT] Full message:\n" + fullText)

    // Check if we have tool calls - always generate follow-up response when tools are called
    if (toolCalls && toolCalls.length > 0) {
      // Generate follow-up response to present tool results clearly

      // Create a follow-up message with tool results to force AI to generate text
      const toolResultsText = toolResults.map(result => {
        return `Tool ${result.toolName} result: ${result.output}`
      }).join('\n\n')


      const followUpMessages = [
        ...lastAIMessages,
        {
          role: ROLES.assistant,
          content: fullText || TEXT.assistantFoundPrefix,
        },
        {
          role: ROLES.user,
          content: `${TEXT.followUpUserInstruction} ${toolResultsText}`,
        },
      ]

      try {
        const followUpResult = await streamText({
          model: gemini(geminiModel.model),
          system: completePrompt,
          messages: followUpMessages,
          maxOutputTokens: aiAgent.maxTokens,
          temperature: aiAgent.temperature,
        })

        // Process follow-up streaming text using common function
        const { messageCount: followUpMessageCount, fullText: followUpText } = await processStreamingText(
          followUpResult.textStream,
          message.conversationId
        )
        console.log("[AGENT] Follow-up message:\n" + followUpText)

        if (followUpMessageCount > 0) {
          return true
        }
      } catch (followUpError) {
        console.error(" [GEMINI AGENT] Error in follow-up response:", followUpError)
        return true
      }
    }

    // No tools used: send first response once
    if (!toolCalls || toolCalls.length === 0) {
      const sent = await sendProcessedTextParts(message.conversationId, fullText)
      if (sent > 0) return true
    }

    if (messageCount > 0) {
      return true
    }

    return false
  } catch (error) {
    console.error(" [GEMINI AGENT] Error in replyByGemini:", error)
    return false
  }
}

async function replyByOpenAI({
  message,
  lastAIMessages,
  aiAgent,
  tools,
  availableTools,
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
      apiKey: (integrationOpenAI!.auth as SecretTextAuthValue | null)
        ?.secretText,
    })

    const openaiModel = (aiAgent.models as AIAgentProvider[]).find(
      (v) => v.provider === "openAI",
    )
    if (!openaiModel) {
      return false
    }

    // Agent model being used
    console.log("[AGENT] OpenAI model:", openaiModel!.model)

    // Tools are provided from caller (pre-built)

    // Generate dynamic prompt
    const completePrompt = generateCompletePrompt(aiAgent.prompt, availableTools)

    const result = await streamText({
      model: openai(openaiModel!.model),
      system: completePrompt,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
    })

    // Process streaming text using common function
    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      message.conversationId,
      { sendParts: false }
    )

    // Get tool calls and results
    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults

    // 1) Tool calls used
    console.log("[AGENT] Tool calls:", (toolCalls || []).map((t: any) => t.toolName || t.name))
    // 2) Full assistant message
    console.log("[AGENT] Full message:\n" + fullText)

    // Check if we have tool calls - always generate follow-up response when tools are called
    if (toolCalls && toolCalls.length > 0) {
      // Generate follow-up response to present tool results clearly

      // Create a follow-up message with tool results to force AI to generate text
      const toolResultsText = toolResults.map(result => {
        return `Tool ${result.toolName} result: ${result.output}`
      }).join('\n\n')


      const followUpMessages = [
        ...lastAIMessages,
        {
          role: ROLES.assistant,
          content: fullText || TEXT.assistantFoundPrefix,
        },
        {
          role: ROLES.user,
          content: `${TEXT.followUpUserInstruction} ${toolResultsText}`,
        },
      ]



      try {
        const followUpResult = await streamText({
          model: openai(openaiModel!.model),
          system: completePrompt,
          messages: followUpMessages,
          maxOutputTokens: aiAgent.maxTokens,
          temperature: aiAgent.temperature,
        })

        // Process follow-up streaming text using common function
        const { messageCount: followUpMessageCount, fullText: followUpText } = await processStreamingText(
          followUpResult.textStream,
          message.conversationId
        )
        console.log("[AGENT] Follow-up message:\n" + followUpText)

        if (followUpMessageCount > 0) {
          return true
        }
      } catch (followUpError) {
        console.error("🚀 [OPENAI AGENT] Error in follow-up response:", followUpError)
        const fallbackMessage = `${TEXT.foundProductsFallbackPrefix}\n\n${toolResultsText}`
        await sendMessageWithRender(message.conversationId, fallbackMessage)
        return true
      }
    }
    // No tools used: send first response once
    if (!toolCalls || toolCalls.length === 0) {
      const sent = await sendProcessedTextParts(message.conversationId, fullText)
      if (sent > 0) return true
    }

    return false
  } catch (error) {
    console.error("🚀 [OPENAI AGENT] Error in replyByOpenAI:", error)
    return false
  }
}

// Helper function để clean schema cho Gemini compatibility
function cleanSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema
  }

  const cleaned = { ...schema }

  // Remove required fields for non-object properties
  if (cleaned.properties && typeof cleaned.properties === JSON_TYPE.object) {
    const cleanedProperties = { ...cleaned.properties }

    for (const [key, prop] of Object.entries(cleanedProperties)) {
      if (prop && typeof prop === JSON_TYPE.object) {
        const propObj = prop as any

        // If property is not an object type, remove required field
        if (propObj.type && propObj.type !== JSON_TYPE.object && propObj.required) {
          delete propObj.required
        }

        // Recursively clean nested objects
        if (propObj.properties) {
          propObj.properties = cleanSchemaForGemini(propObj.properties)
        }

        // Clean items schema for arrays
        if (propObj.items) {
          propObj.items = cleanSchemaForGemini(propObj.items)
        }
      }
    }

    cleaned.properties = cleanedProperties
  }

  return cleaned
}

// 1. AIFile tools - file_search function
async function getAIFileTools(aiAgent: AIAgentModel): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    const selectedFileIds = parseSelectedIdsFromTools(aiAgent.tools, TOOL_PREFIX.file)

    if (selectedFileIds.length === 0) {
      return tools
    }

    const allFiles = await prisma.aIFile.findMany({
      where: {
        chatbotId: aiAgent.chatbotId,
        id: { in: selectedFileIds },
      },
    })

    if (allFiles.length > 0) {
      tools.file_search = tool({
        description: "Tìm kiếm thông tin trong các file đã upload để trả lời câu hỏi về sản phẩm, chính sách, thông tin công ty",
        inputSchema: jsonSchema({
          type: JSON_TYPE.object,
          properties: {
            query: {
              type: JSON_TYPE.string,
              description: "Từ khóa tìm kiếm để tìm thông tin liên quan",
            },
          },
          required: ["query"],
        }),
        execute: async (args) => {
          try {
            // TODO: Implement vector DB search when files are processed
          } catch (error) {
            return `${TEXT.fileSearchErrorPrefix} ${error instanceof Error ? error.message : "Unknown error"}`
          }
        },
      })
    }

    return tools
  } catch (error) {
    console.error("Error in getAIFileTools:", error)
    return {}
  }
}

// 2. AIFunction tools - functions 
async function getAIFunctionTools(aiAgent: AIAgentModel): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    const selectedFunctionIds = parseSelectedIdsFromTools(aiAgent.tools, TOOL_PREFIX.fn)

    if (selectedFunctionIds.length === 0) {
      return tools
    }

    const aiFunctions = await prisma.aIFunction.findMany({
      where: {
        chatbotId: aiAgent.chatbotId,
        id: { in: selectedFunctionIds },
      },
    })

    for (const aiFunction of aiFunctions) {
      try {
        const functionName = aiFunction.name
        const functionPurpose = aiFunction.purpose || ""
        const dataCollect = aiFunction.dataCollect as Record<string, any> || {}
        const outputMessage = aiFunction.outputMessage || ""

        const properties: Record<string, any> = {}
        const required: string[] = []

        if (dataCollect && typeof dataCollect === JSON_TYPE.object) {
          for (const [key, value] of Object.entries(dataCollect)) {
            if (value && typeof value === JSON_TYPE.object) {
              properties[key] = {
                type: (value.type as JsonType) || JSON_TYPE.string,
                description: value.description || "",
              }
              if (value.required) {
                required.push(key)
              }
            }
          }
        }

        tools[functionName] = tool({
          description: functionPurpose,
          inputSchema: jsonSchema({
            type: JSON_TYPE.object,
            properties,
            required,
          }),
          execute: async (args) => {
            try {
              return outputMessage
            } catch (error) {
              return `Error: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          },
        })
      } catch (error) {
        console.error(`Error processing AI function ${aiFunction.name}:`, error)
      }
    }

    return tools
  } catch (error) {
    console.error("Error in getAIFunctionTools:", error)
    return {}
  }
}

// 3. MCP Server tools - functions from MCP servers
async function getMCPServerTools(aiAgent: AIAgentModel): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    const selectedMCPs = parseSelectedIdsFromTools(aiAgent.tools, TOOL_PREFIX.mcp)

    if (selectedMCPs.length === 0) {
      return tools
    }

    const mcpServers = await prisma.aIMCPServer.findMany({
      where: {
        chatbotId: aiAgent.chatbotId,
        id: { in: selectedMCPs },
      },
    })

    if (mcpServers.length === 0) {
      return tools
    }

    for (const mcpServer of mcpServers) {
      try {
        const availableTools = mcpServer.availableTools as Record<
          string,
          {
            description: string
            inputSchema: { jsonSchema: unknown }
          }
        >

        if (!availableTools || typeof availableTools !== JSON_TYPE.object) {
          continue
        }

        for (const toolName of mcpServer.selectedTools) {
          const toolDef = availableTools[toolName]
          if (!toolDef) {
            continue
          }

          const uniqueToolName = `${mcpServer.name}_${toolName}`

          try {
            const cleanedSchema = cleanSchemaForGemini(toolDef.inputSchema.jsonSchema)

            tools[uniqueToolName] = tool({
              description: `${toolDef.description} (from ${mcpServer.name})`,
              inputSchema: jsonSchema(cleanedSchema as any),
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
          } catch (schemaError) {
            console.error(`Schema error for tool ${uniqueToolName}:`, schemaError)
          }
        }
      } catch (error) {
        console.error(`Error processing MCP server ${mcpServer.name}:`, error)
      }
    }

    return tools
  } catch (error) {
    console.error("Error in getMCPServerTools:", error)
    return {}
  }
}

// System base prompt
function getSystemBasePrompt(): string {
  return [PROMPT.system.header, ...PROMPT.system.rules].join("\n")
}

// Generate dynamic tool instructions based on available tools
function generateToolInstructions(availableTools: {
  fileTools: string[]
  functionTools: string[]
  mcpTools: string[]
}): string {
  const lines: string[] = []

  // Required rules
  lines.push(PROMPT.tools.requiredHeader)
  lines.push(...PROMPT.tools.requiredRules)
  lines.push("")

  // File tools
  if (availableTools.fileTools.length > 0) {
    lines.push(PROMPT.tools.usageHeader)
    lines.push("")
    lines.push(...PROMPT.tools.fileSearch)
    lines.push("")
  }

  // Custom functions
  if (availableTools.functionTools.length > 0) {
    lines.push(PROMPT.tools.customFunctionsLabel(availableTools.functionTools))
    lines.push("")
  }

  // MCP tools
  if (availableTools.mcpTools.length > 0) {
    lines.push(PROMPT.tools.mcpToolsLabel(availableTools.mcpTools))
    lines.push("")
  }

  if (availableTools.mcpTools.some((tool) => tool.includes('weather'))) {
    lines.push(PROMPT.tools.weatherHint)
    lines.push("")
  }

  // Final rules
  lines.push(PROMPT.tools.finalHeader)
  lines.push(...PROMPT.tools.finalRules)

  return lines.join("\n")
}

// Generate complete prompt by combining user prompt and tool instructions
function generateCompletePrompt(
  userPrompt: string | null,
  availableTools: {
    fileTools: string[]
    functionTools: string[]
    mcpTools: string[]
  }
): string {
  const toolInstructions = generateToolInstructions(availableTools)

  // Use user prompt as base, fallback to default if empty
  const basePrompt = (userPrompt && userPrompt.trim()) ? userPrompt : ''

  // Combine prompts
  const parts = [getSystemBasePrompt(), basePrompt]

  // Add tool instructions if there are any tools available
  if (Object.values(availableTools).some(tools => tools.length > 0)) {
    parts.push(`\n${toolInstructions}`)
  }

  return parts.join("\n")
}

async function getSelectedTools(aiAgent: AIAgentModel): Promise<{
  tools: ToolSet
  availableTools: {
    fileTools: string[]
    functionTools: string[]
    mcpTools: string[]
  }
}> {
  try {
    // Get tools from all sources
    const [fileTools, functionTools, mcpTools] = await Promise.all([
      getAIFileTools(aiAgent),
      getAIFunctionTools(aiAgent),
      getMCPServerTools(aiAgent),
    ])

    // Merge all tools
    const allTools = {
      ...fileTools,
      ...functionTools,
      ...mcpTools,
    }

    const availableTools = {
      fileTools: Object.keys(fileTools),
      functionTools: Object.keys(functionTools),
      mcpTools: Object.keys(mcpTools),
    }

    console.log("🔧 [TOOLS] File tools:", availableTools.fileTools)
    console.log("🔧 [TOOLS] Function tools:", availableTools.functionTools)
    console.log("🔧 [TOOLS] MCP tools:", availableTools.mcpTools)
    console.log("🔧 [TOOLS] Total tools:", Object.keys(allTools))

    return { tools: allTools, availableTools }
  } catch (error) {
    console.error("Error in getSelectedTools:", error)
    return {
      tools: {},
      availableTools: {
        fileTools: [],
        functionTools: [],
        mcpTools: []
      }
    }
  }
}

async function sendMessageWithRender(
  conversationId: string,
  message: string
): Promise<void> {
  const rendered = renderMessageContent(message)
  await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
    type: ChatJobAction.SEND_FLOW_STEP,
    data: {
      conversationId,
      flowVersionId: "",
      step: {
        id: createId(),
        message: rendered,
        stepType: StepType.SEND_TEXT,
        buttons: [],
      },
    },
  })
}

async function sendProcessedTextParts(
  conversationId: string,
  text: string
): Promise<number> {
  let count = 0
  const parts = processTextForImagesAndLinks(text)
  for (const part of parts) {
    const trimmedPart = part.trim()
    if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
      count++
      await sendMessageWithRender(conversationId, trimmedPart)
    }
  }
  return count
}

async function processStreamingText(
  textStream: AsyncIterable<string>,
  conversationId: string,
  options?: { sendParts?: boolean }
): Promise<{ messageCount: number; fullText: string }> {
  let fullText = ""
  let currentMessage = ""
  let messageCount = 0
  const sendParts = options?.sendParts !== false

  for await (const delta of textStream) {
    fullText += delta
    currentMessage += delta

    // Check if we encounter \n\n (double newline) - this is the primary delimiter
    if (currentMessage.includes('\n\n')) {
      const segments = currentMessage.split('\n\n')

      // Process all complete segments (except the last one which might be incomplete)
      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i].trim()
        if (!segment) continue

        // Process this segment for images and links
        const processedParts = processTextForImagesAndLinks(segment)

        // Send each processed part as a separate message (optional)
        for (const part of processedParts) {
          const trimmedPart = part.trim()
          if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
            messageCount++
            if (sendParts) {
              await sendMessageWithRender(conversationId, trimmedPart)
            }
          }
        }
      }

      currentMessage = segments[segments.length - 1]
    }
  }

  // Send any remaining text that didn't end with \n\n
  if (currentMessage.trim()) {
    const parts = processTextForImagesAndLinks(currentMessage)

    for (const part of parts) {
      const trimmedPart = part.trim()
      if (trimmedPart && trimmedPart.length > 0 && !/^\s*$/.test(trimmedPart)) {
        messageCount++
        if (sendParts) {
          await sendMessageWithRender(conversationId, trimmedPart)
        }
      }
    }
  }

  return { messageCount, fullText }
}