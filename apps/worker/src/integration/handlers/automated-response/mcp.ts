import { JSON_TYPE, TEXT, AUTH_TYPES, type JsonType } from "./constants"

export async function callMCPTool(
    mcpServerUrl: string,
    toolName: string,
    args: Record<string, unknown>,
    auth?: any,
): Promise<any> {
    try {
        const requestId = Date.now() + Math.floor(Math.random() * 1000)
        const requestBody = {
            jsonrpc: TEXT.jsonRpcVersion,
            id: requestId,
            method: "tools/call",
            params: {
                name: toolName,
                arguments: args,
            },
        }

        const headers: Record<string, string> = {
            "Content-Type": TEXT.contentType,
        }

        if (auth) {
            switch (auth.type) {
                case AUTH_TYPES.TOKEN:
                    headers.Authorization = `${TEXT.bearerTokenPrefix}${auth.token}`
                    break
                case AUTH_TYPES.HEADERS:
                    for (const header of auth.headers) {
                        headers[header.header] = header.value
                    }
                    break
                case AUTH_TYPES.NONE:
                default:
                    break
            }
        }

        const response = await fetch(mcpServerUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
        }

        const result = await response.json()

        if (result.jsonrpc !== TEXT.jsonRpcVersion) {
            throw new Error("Invalid JSON-RPC 2.0 response")
        }

        if (result.error) {
            throw new Error(`MCP tool error: ${result.error.message}`)
        }

        let content = result.result?.content || result.result

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
        return {
            error: error instanceof Error ? error.message : TEXT.unknownError,
            success: false,
        }
    }
}

export function cleanSchemaForGemini(schema: any): any {
    if (!schema || typeof schema !== JSON_TYPE.object) {
        return schema
    }

    const cleaned = { ...schema }

    if (cleaned.properties && typeof cleaned.properties === JSON_TYPE.object) {
        const cleanedProperties = { ...cleaned.properties }

        for (const [key, prop] of Object.entries(cleanedProperties)) {
            if (prop && typeof prop === JSON_TYPE.object) {
                const propObj = prop as any

                if (propObj.type && propObj.type !== JSON_TYPE.object && propObj.required) {
                    delete propObj.required
                }

                if (propObj.properties) {
                    propObj.properties = cleanSchemaForGemini(propObj.properties)
                }

                if (propObj.items) {
                    propObj.items = cleanSchemaForGemini(propObj.items)
                }
            }
        }

        cleaned.properties = cleanedProperties
    }

    return cleaned
}


