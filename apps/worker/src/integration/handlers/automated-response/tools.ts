import { prisma } from "@aha.chat/database"
import type { AIAgentModel } from "@aha.chat/database/types"
import { jsonSchema, tool, type ToolSet } from "ai"
import { JSON_TYPE, TOOL_PREFIX, TEXT } from "./constants"
import { performFileSearch } from "./search"
import { callMCPTool, cleanSchemaForGemini } from "./mcp"

function parseSelectedIdsFromTools(all: readonly string[], prefix: string): string[] {
    return all
        .filter((value) => value.startsWith(prefix))
        .map((value) => value.slice(prefix.length))
        .filter((id) => Boolean(id))
}

async function getAIFileTools(aiAgent: AIAgentModel): Promise<ToolSet> {
    try {
        const tools: ToolSet = {}

        const selectedFileIds = parseSelectedIdsFromTools(aiAgent.tools, TOOL_PREFIX.file)
        if (selectedFileIds.length === 0) return tools

        const allFiles = await prisma.aIFile.findMany({
            where: { chatbotId: aiAgent.chatbotId, id: { in: selectedFileIds } },
        })

        if (allFiles.length > 0) {
            tools.file_search = tool({
                description: TEXT.fileSearchDescription,
                inputSchema: jsonSchema({
                    type: JSON_TYPE.object,
                    properties: {
                        query: { type: JSON_TYPE.string, description: TEXT.fileSearchQueryDescription },
                    },
                    required: ["query"],
                }),
                execute: async (args: { query: string }) => {
                    const config = {
                        chatbotId: aiAgent.chatbotId,
                        selectedFileIds,
                        similarityThreshold: 0.7,
                        maxResults: 5,
                    }
                    return await performFileSearch(args, config)
                },
            })
        }

        return tools
    } catch (error) {
        return {}
    }
}

async function getAIFunctionTools(aiAgent: AIAgentModel): Promise<ToolSet> {
    try {
        const tools: ToolSet = {}
        const selectedFunctionIds = parseSelectedIdsFromTools(aiAgent.tools, TOOL_PREFIX.fn)
        if (selectedFunctionIds.length === 0) return tools

        const aiFunctions = await prisma.aIFunction.findMany({
            where: { chatbotId: aiAgent.chatbotId, id: { in: selectedFunctionIds } },
        })

        for (const aiFunction of aiFunctions) {
            try {
                const functionName = aiFunction.name
                const functionPurpose = aiFunction.purpose || ""
                const dataCollect = (aiFunction.dataCollect as Record<string, any>) || {}
                const outputMessage = aiFunction.outputMessage || ""

                const properties: Record<string, any> = {}
                const required: string[] = []

                if (dataCollect && typeof dataCollect === JSON_TYPE.object) {
                    for (const [key, value] of Object.entries(dataCollect)) {
                        if (value && typeof value === JSON_TYPE.object) {
                            properties[key] = {
                                type: (value.type as any) || JSON_TYPE.string,
                                description: (value as any).description || "",
                            }
                            if ((value as any).required) required.push(key)
                        }
                    }
                }

                tools[functionName] = tool({
                    description: functionPurpose,
                    inputSchema: jsonSchema({ type: JSON_TYPE.object, properties, required }),
                    execute: async (args) => {
                        try {
                            return outputMessage
                        } catch (error) {
                            return `Error: ${error instanceof Error ? error.message : "Unknown error"}`
                        }
                    },
                })
            } catch (error) {
            }
        }

        return tools
    } catch (error) {
        return {}
    }
}

async function getMCPServerTools(aiAgent: AIAgentModel): Promise<ToolSet> {
    try {
        const tools: ToolSet = {}
        const selectedMCPs = parseSelectedIdsFromTools(aiAgent.tools, TOOL_PREFIX.mcp)
        if (selectedMCPs.length === 0) return tools

        const mcpServers = await prisma.aIMCPServer.findMany({
            where: { chatbotId: aiAgent.chatbotId, id: { in: selectedMCPs } },
        })
        if (mcpServers.length === 0) return tools

        for (const mcpServer of mcpServers) {
            try {
                const availableTools = mcpServer.availableTools as Record<
                    string,
                    { description: string; inputSchema: { jsonSchema: unknown } }
                >
                if (!availableTools || typeof availableTools !== JSON_TYPE.object) continue

                for (const toolName of mcpServer.selectedTools) {
                    const toolDef = availableTools[toolName]
                    if (!toolDef) continue

                    const cleanToolName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_")
                    const cleanServerName = mcpServer.name.replace(/[^a-zA-Z0-9_-]/g, "_")
                    const uniqueToolName = `${cleanServerName}_${cleanToolName}`

                    const toolNamePattern = /^[a-zA-Z0-9_-]+$/
                    if (!toolNamePattern.test(uniqueToolName)) continue

                    try {
                        const cleanedSchema = cleanSchemaForGemini(toolDef.inputSchema.jsonSchema)
                        tools[uniqueToolName] = tool({
                            description: `${toolDef.description} (from ${mcpServer.name})`,
                            inputSchema: jsonSchema(cleanedSchema as any),
                            execute: async (args) => {
                                try {
                                    const result = await callMCPTool(mcpServer.url, toolName, args, mcpServer.auth)
                                    return (result as any).content || result
                                } catch (error) {
                                    return `Error: ${error instanceof Error ? error.message : "Unknown error"}`
                                }
                            },
                        })
                    } catch (schemaError) {
                    }
                }
            } catch (error) {
            }
        }

        return tools
    } catch (error) {
        return {}
    }
}

export async function getSelectedTools(aiAgent: AIAgentModel): Promise<{
    tools: ToolSet
    availableTools: { fileTools: string[]; functionTools: string[]; mcpTools: string[] }
}> {
    try {
        const [fileTools, functionTools, mcpTools] = await Promise.all([
            getAIFileTools(aiAgent),
            getAIFunctionTools(aiAgent),
            getMCPServerTools(aiAgent),
        ])

        const allTools = { ...fileTools, ...functionTools, ...mcpTools }
        const availableTools = {
            fileTools: Object.keys(fileTools),
            functionTools: Object.keys(functionTools),
            mcpTools: Object.keys(mcpTools),
        }

        return { tools: allTools, availableTools }
    } catch (error) {
        return { tools: {}, availableTools: { fileTools: [], functionTools: [], mcpTools: [] } }
    }
}


