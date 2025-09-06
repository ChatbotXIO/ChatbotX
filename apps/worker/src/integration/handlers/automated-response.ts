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
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { createId } from "@paralleldrive/cuid2"
import {
  experimental_createMCPClient,
  type experimental_MCPClient,
  generateText,
  jsonSchema,
  type ToolSet,
  tool,
} from "ai"
import { logger } from "../../lib/logger"

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
    console.log("replied by automated response")
    return
  }

  const aiAgent = await prisma.aIAgent.findFirst({
    where: {
      chatbotId: message.chatbotId,
      isDefault: true,
    },
  })
  console.log("aiAgent", aiAgent)
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
  console.log("lastAIMessages", lastAIMessages)

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
  // const allMCPServers = await prisma.aIMCPServer.findMany({
  //   where: {
  //     chatbotId: message.chatbotId,
  //   },
  // })

  if (
    await replyByOpenAI({
      message,
      lastAIMessages,
      aiAgent,
      allFiles,
      allFunctions,
    })
  ) {
    console.log("replied by openai")
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
    // Trigger flow if message matched automatedResponses config
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
  console.log("integrationGemini", integrationGemini)
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
  console.log("textttttttt", text)

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
  let httpClient: experimental_MCPClient | null = null
  try {
    const integrationOpenAI = await prisma.integrationOpenAI.findFirst({
      where: {
        chatbotId: message.chatbotId,
        autoReply: true,
      },
    })
    console.log("integrationOpenAI", integrationOpenAI)
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

    const httpTransport = new StreamableHTTPClientTransport(
      new URL("https://ahabanana-store.myshopify.com/api/mcp"),
    )
    httpClient = await experimental_createMCPClient({
      transport: httpTransport,
    })

    const tools = await httpClient.tools()

    // const tools = await getSelectedTools(aiAgent)
    // console.log("toolssssss", tools)

    const output = await generateText({
      model: openai(openaiModel.model),
      system: aiAgent.prompt ?? undefined,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxTokens,
      temperature: aiAgent.temperature,
      tools,
    })

    if (output.text.length > 0) {
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
    console.error("error", error)
    return false
  } finally {
    if (httpClient) {
      await httpClient.close()
    }
  }
}

async function getSelectedTools(aiAgent: AIAgentModel) {
  const selectedMCPs = aiAgent.tools
    .filter((v) => v.startsWith("mcp"))
    .map((v) => v.split(":")[1])

  console.log("selectedMCPPPP", selectedMCPs)
  const mcpServers = await prisma.aIMCPServer.findMany({
    where: {
      chatbotId: aiAgent.chatbotId,
      id: {
        in: selectedMCPs,
      },
    },
  })

  const tools: ToolSet = {}
  for (const mcpServer of mcpServers) {
    const availableTools = mcpServer.availableTools as unknown as Awaited<
      ReturnType<
        Awaited<ReturnType<typeof experimental_createMCPClient>>["tools"]
      >
    >

    for (const tl of mcpServer.selectedTools) {
      if (Object.hasOwn(availableTools, tl)) {
        tools[tl] = tool({
          description: availableTools[tl].description,
          inputSchema: jsonSchema(
            (availableTools[tl].inputSchema as any).jsonSchema,
          ),
        })
      }
    }
  }
  console.log("toolssssss", tools)
  return tools
}
