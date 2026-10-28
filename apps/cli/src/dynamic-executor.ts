import { printResult } from "./commands/utils"
import type { DynamicTool } from "./openapi-loader"

/** A CLI argument: one value, or the values of a repeated array flag. */
export type CliParamValue = string | string[]

/**
 * Array members use the indexed bracket form (`channels[0]=a&channels[1]=b`),
 * the same encoding the MCP server sends and the builder's oRPC decodes.
 */
function buildQueryString(params: Record<string, CliParamValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        search.append(`${key}[${index}]`, item)
      }
      continue
    }
    search.append(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

const NO_BODY_METHODS = new Set(["GET", "HEAD"])

type BodyPropertySchema = {
  type?: string | string[]
  nullable?: boolean
  anyOf?: BodyPropertySchema[]
  oneOf?: BodyPropertySchema[]
}

/** Whether the property takes a JSON `null` (nullable, a null union member or a type list with null). */
const acceptsNull = (schema: BodyPropertySchema | undefined): boolean =>
  schema?.nullable === true ||
  schema?.type === "null" ||
  (Array.isArray(schema?.type) && schema.type.includes("null")) ||
  [...(schema?.anyOf ?? []), ...(schema?.oneOf ?? [])].some(acceptsNull)

export async function executeDynamicCommand(
  tool: DynamicTool,
  params: Record<string, CliParamValue>,
  config: { apiKey: string; apiUrl: string },
): Promise<void> {
  let path = tool.pathTemplate

  for (const paramName of tool.pathParamNames) {
    const value = params[paramName]
    if (!value || Array.isArray(value)) {
      throw new Error(`Missing required path parameter: ${paramName}`)
    }
    path = path.replace(`{${paramName}}`, encodeURIComponent(value))
  }

  const queryArgs: Record<string, CliParamValue> = {}
  for (const key of tool.queryParamNames) {
    const value = params[key]
    if (value !== undefined) {
      queryArgs[key] = value
    }
  }

  const body: Record<string, unknown> = {}
  for (const key of tool.bodyParamNames) {
    const value = params[key]
    if (typeof value === "string") {
      const propSchema = tool.inputSchema.properties[key] as
        | BodyPropertySchema
        | undefined
      // Flags are always text, so `--currency null` is how a CLI user sends a
      // JSON null (e.g. "clear it") to a property that accepts one.
      if (value === "null" && acceptsNull(propSchema)) {
        body[key] = null
      } else if (
        propSchema?.type === "array" ||
        propSchema?.type === "object"
      ) {
        try {
          body[key] = JSON.parse(value)
        } catch {
          body[key] = value
        }
      } else {
        body[key] = value
      }
    }
  }

  const baseUrl = tool.baseUrl.startsWith("http")
    ? tool.baseUrl
    : `${config.apiUrl}${tool.baseUrl}`
  const url = `${baseUrl}${path}${buildQueryString(queryArgs)}`
  const sendBody =
    !NO_BODY_METHODS.has(tool.method) && tool.bodyParamNames.length > 0

  const response = await fetch(url, {
    method: tool.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: sendBody ? JSON.stringify(body) : undefined,
  })

  let result: unknown
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    result = await response.json()
  } else {
    result = await response.text()
  }

  if (!response.ok) {
    throw new Error(
      `Error ${response.status}: ${JSON.stringify(result, null, 2)}`,
    )
  }

  printResult(result)
}
