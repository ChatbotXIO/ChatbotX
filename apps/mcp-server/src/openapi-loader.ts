import { env } from "./env"

interface OpenAPISpec {
  paths?: Record<string, Record<string, OpenAPIOperation>>
  servers?: Array<{ url: string }>
}

interface OpenAPIOperation {
  description?: string
  operationId?: string
  parameters?: OpenAPIParameter[]
  requestBody?: {
    required?: boolean
    content?: {
      "application/json"?: {
        schema?: OpenAPISchemaObject
      }
    }
  }
  summary?: string
}

interface OpenAPIParameter {
  description?: string
  in: "path" | "query" | "header" | "cookie"
  name: string
  required?: boolean
  schema?: OpenAPISchemaObject
}

interface OpenAPISchemaObject {
  allOf?: OpenAPISchemaObject[]
  anyOf?: OpenAPISchemaObject[]
  default?: unknown
  description?: string
  enum?: unknown[]
  format?: string
  items?: OpenAPISchemaObject
  nullable?: boolean
  oneOf?: OpenAPISchemaObject[]
  properties?: Record<string, OpenAPISchemaObject>
  required?: string[]
  type?: string
}

export interface DynamicTool {
  baseUrl: string
  bodyParamNames: string[]
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
  method: string
  name: string
  pathParamNames: string[]
  pathTemplate: string
  queryParamNames: string[]
}

let cachedTools: DynamicTool[] | null = null

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"])

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]{2,})(?=[A-Z][a-z]|$)/g, "_$1")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[.\-\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

function extractPathParamNames(pathTemplate: string): string[] {
  const matches = pathTemplate.match(/\{([^}]+)\}/g)
  return matches ? matches.map((m) => m.slice(1, -1)) : []
}

function buildInputSchema(operation: OpenAPIOperation): {
  schema: DynamicTool["inputSchema"]
  bodyParamNames: string[]
  queryParamNames: string[]
} {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  const bodyParamNames: string[] = []
  const queryParamNames: string[] = []

  for (const param of operation.parameters ?? []) {
    if (param.in !== "path" && param.in !== "query") {
      continue
    }
    const schema: Record<string, unknown> = {
      ...(param.schema ?? { type: "string" }),
    }
    if (param.description) {
      schema.description = param.description
    }
    properties[param.name] = schema
    if (param.required || param.in === "path") {
      required.push(param.name)
    }
    if (param.in === "query") {
      queryParamNames.push(param.name)
    }
  }

  const bodySchema =
    operation.requestBody?.content?.["application/json"]?.schema
  if (bodySchema?.properties) {
    for (const [key, value] of Object.entries(bodySchema.properties)) {
      properties[key] = value
      bodyParamNames.push(key)
    }
    for (const key of bodySchema.required ?? []) {
      if (!required.includes(key)) {
        required.push(key)
      }
    }
  }

  return {
    schema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    bodyParamNames,
    queryParamNames,
  }
}

export async function loadOpenApiSpec(): Promise<DynamicTool[]> {
  if (cachedTools !== null) {
    return cachedTools
  }

  const specUrl = `${env.CHATBOTX_API_URL}/public-spec.json`

  const response = await fetch(specUrl, {
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI spec from ${specUrl}: ${response.status} ${response.statusText}`,
    )
  }

  const spec = (await response.json()) as OpenAPISpec
  const baseUrl = spec.servers?.[0]?.url ?? env.CHATBOTX_API_URL
  const tools: DynamicTool[] = []

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [httpMethod, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(httpMethod)) {
        continue
      }
      if (!operation.operationId) {
        continue
      }

      const pathParamNames = extractPathParamNames(pathTemplate)
      const { schema, bodyParamNames, queryParamNames } =
        buildInputSchema(operation)

      tools.push({
        name: toSnakeCase(operation.operationId),
        description:
          operation.summary ?? operation.description ?? operation.operationId,
        inputSchema: schema,
        baseUrl,
        pathTemplate,
        method: httpMethod.toUpperCase(),
        pathParamNames,
        bodyParamNames,
        queryParamNames,
      })
    }
  }

  cachedTools = tools
  // stderr keeps this out of the stdio MCP transport stream
  console.error(`Loaded ${tools.length} tools from OpenAPI spec`)
  return tools
}

export function getCachedTools(): DynamicTool[] {
  return cachedTools ?? []
}
