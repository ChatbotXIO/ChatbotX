import { prisma } from "@aha.chat/database"
import { StepType } from "@aha.chat/flow-config"
import { SenderType } from "@aha.chat/database/types"
import type { ReplyByAIProps, AIMessage } from "./types"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText } from "ai"
import { TEXT, ROLES, AI_PROVIDERS } from "./constants"
import { chatQueue, ChatJobAction } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { sendProcessedTextParts, processStreamingText, sendMessageWithRender } from "./text"

async function replaceCustomFieldAttributes(message: string, conversationId: string): Promise<string> {
    try {
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId },
            include: {
                contact: {
                    include: {
                        contactCustomFields: {
                            include: {
                                customField: true
                            }
                        }
                    }
                }
            }
        })

        if (!conversation?.contact) {
            return message
        }

        const fieldMap = new Map<string, string>()
        for (const customField of conversation.contact.contactCustomFields) {
            if (customField.customField?.name && customField.value) {
                fieldMap.set(customField.customField.name, customField.value)
            }
        }

        let processedMessage = message
        const attributeRegex = /\{\{(\w+)\}\}/g

        processedMessage = processedMessage.replace(attributeRegex, (match, fieldName) => {
            const value = fieldMap.get(fieldName)
            return value || match
        })

        return processedMessage
    } catch (error) {
        return message
    }
}

export async function listAllEnabledAutomatedResponses({ chatbotId }: { chatbotId: string }) {
    try {
        return await prisma.automatedResponse.findMany({
            where: { chatbotId, status: true },
        })
    } catch (err) {
        return []
    }
}

export async function replyByAutomatedResponse({ message }: { message: { content?: string | null; conversationId: string; chatbotId: string } }): Promise<boolean> {
    let replied = false
    const allAutomatedResponses = await listAllEnabledAutomatedResponses({ chatbotId: message.chatbotId })
    if (allAutomatedResponses.length === 0) return false

    for (const automatedResponse of allAutomatedResponses) {
        const matched = automatedResponse.userMessages.some((v) => (message.content ?? "").includes(v))
        if (matched) {
            for (const reply of automatedResponse.replies as any[]) {
                switch (reply.type) {
                    case 0: // ReplyType.MESSAGE
                        await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
                            type: ChatJobAction.SEND_FLOW_STEP,
                            data: {
                                conversationId: message.conversationId,
                                flowVersionId: "",
                                step: { id: createId(), message: reply.message, stepType: StepType.SEND_TEXT, buttons: [] },
                            },
                        })
                        replied = true
                        break
                    case 1: // ReplyType.FLOW
                        // handled in original file via integrationQueue; keep behavior there
                        break
                    default:
                        break
                }
            }
        }
    }
    return replied
}

export async function replyByGemini(props: ReplyByAIProps): Promise<boolean> {
    const { message, lastAIMessages, aiAgent, tools, availableTools } = props
    try {
        const integrationGemini = await prisma.integrationGemini.findFirst({ where: { chatbotId: message.chatbotId, autoReply: true } })
        if (!integrationGemini) return false

        const gemini = createGoogleGenerativeAI({ apiKey: (integrationGemini.auth as any)?.secretText })
        const geminiModel = (aiAgent.models as any[]).find((v) => v.provider === AI_PROVIDERS.GEMINI)
        if (!geminiModel) return false

        const completePrompt = await replaceCustomFieldAttributes(aiAgent.prompt || "", message.conversationId)


        const result = await streamText({
            model: gemini(geminiModel.model),
            system: completePrompt,
            messages: lastAIMessages,
            maxOutputTokens: aiAgent.maxTokens,
            temperature: aiAgent.temperature,
            tools,
            toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
        })

        const toolCalls = await result.toolCalls
        const toolResults = await result.toolResults


        const { messageCount, fullText } = await processStreamingText(result.textStream, message.conversationId, { sendParts: true })

        if (toolCalls && toolCalls.length > 0) {
            const toolResultsText = toolResults.map((r) => `Tool ${r.toolName} result: ${r.output}`).join('\n\n')
            const followUpMessages: AIMessage[] = [
                ...lastAIMessages,
                { role: ROLES.assistant, content: fullText || TEXT.assistantFoundPrefix },
                { role: ROLES.user, content: `${TEXT.followUpInstruction}\n\n${toolResultsText}` },
            ]
            try {
                const followUpResult = await streamText({
                    model: gemini(geminiModel.model),
                    system: completePrompt,
                    messages: followUpMessages,
                    maxOutputTokens: aiAgent.maxTokens,
                    temperature: aiAgent.temperature,
                })
                const { messageCount: followUpMessageCount } = await processStreamingText(followUpResult.textStream, message.conversationId, { sendParts: true })
                if (followUpMessageCount > 0) return true
            } catch (_e) {
                return true
            }
        }

        if (!toolCalls || toolCalls.length === 0) {
            const sent = await sendProcessedTextParts(message.conversationId, fullText)
            if (sent > 0) return true
        }

        if (messageCount > 0) return true
        return false
    } catch (_err) {
        return false
    }
}

export async function replyByOpenAI(props: ReplyByAIProps): Promise<boolean> {
    const { message, lastAIMessages, aiAgent, tools, availableTools } = props
    try {
        const integrationOpenAI = await prisma.integrationOpenAI.findFirst({ where: { chatbotId: message.chatbotId, autoReply: true } })
        if (!integrationOpenAI) return false

        const openai = createOpenAI({ apiKey: (integrationOpenAI.auth as any)?.secretText })
        const openaiModel = (aiAgent.models as any[]).find((v) => v.provider === AI_PROVIDERS.OPENAI)
        if (!openaiModel) return false

        const completePrompt = await replaceCustomFieldAttributes(aiAgent.prompt || "", message.conversationId)


        const result = await streamText({
            model: openai(openaiModel.model),
            system: completePrompt,
            messages: lastAIMessages,
            maxOutputTokens: aiAgent.maxTokens,
            temperature: aiAgent.temperature,
            tools,
            toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
        })

        const toolCalls = await result.toolCalls
        const toolResults = await result.toolResults


        const { messageCount, fullText } = await processStreamingText(result.textStream, message.conversationId, { sendParts: true })

        if (toolCalls && toolCalls.length > 0) {
            const toolResultsText = toolResults.map((r) => `Tool ${r.toolName} result: ${r.output}`).join('\n\n')
            const followUpMessages: AIMessage[] = [
                ...lastAIMessages,
                { role: ROLES.assistant, content: fullText || TEXT.assistantFoundPrefix },
                { role: ROLES.user, content: `${TEXT.followUpInstruction}\n\n${toolResultsText}` },
            ]
            try {
                const followUpResult = await streamText({
                    model: openai(openaiModel.model),
                    system: completePrompt,
                    messages: followUpMessages,
                    maxOutputTokens: aiAgent.maxTokens,
                    temperature: aiAgent.temperature,
                })
                const { messageCount: followUpMessageCount } = await processStreamingText(followUpResult.textStream, message.conversationId, { sendParts: true })
                if (followUpMessageCount > 0) return true
            } catch (_e) {
                const fallbackMessage = `${TEXT.foundProductsFallbackPrefix}\n\n${toolResultsText}`
                await sendMessageWithRender(message.conversationId, fallbackMessage)
                return true
            }
        }

        if (!toolCalls || toolCalls.length === 0) {
            if (messageCount > 0) return true
        }

        return false
    } catch (_err) {
        return false
    }
}


