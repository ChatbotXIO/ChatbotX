// biome-ignore-all lint/suspicious/noExplicitAny: walks untyped OpenAPI JSON
/**
 * Builds the OpenAI profile's tools from the public OpenAPI document. The
 * reviewed part is `openai-contract.ts` (which operations, overrides,
 * confirmation policies); schemas follow the live spec. OpenAI snapshots and
 * reviews tool definitions on its side, keeping the previous approved
 * definition live while a change is held, so the API must stay backward
 * compatible for these tools.
 */
import { parseToolsFromSpec } from "../openapi-loader"
import { createDescriptionFilter } from "./description-filter"
import {
  OPENAI_API_TOOLS,
  OPENAI_CONFIRMED_POLICIES,
  OPENAI_CONTRACT_VERSION,
  OPENAI_TOOL_OVERRIDES,
} from "./openai-contract"
import { TRANSPORT_ONLY_RESPONSE_PROPERTIES } from "./transport-only-fields"

type Spec = { paths: Record<string, Record<string, any>> }

const responseSchemaOf = (
  spec: Spec,
  method: string,
  path: string,
): unknown => {
  const responses = spec.paths[path]?.[method.toLowerCase()]?.responses ?? {}
  const ok = Object.entries(responses).find(([code]) =>
    code.startsWith("2"),
  )?.[1] as any
  return ok?.content?.["application/json"]?.schema ?? null
}

/** Closes every object schema that lists its properties. */
const strict = (schema: any): any => {
  if (Array.isArray(schema)) {
    return schema.map(strict)
  }
  if (schema && typeof schema === "object") {
    const next = Object.fromEntries(
      Object.entries(schema).map(([key, value]) => [key, strict(value)]),
    ) as any
    if (next.type === "object" && next.properties) {
      next.additionalProperties = false
    }
    return next
  }
  return schema
}

const omitProperties = (schema: any, keys: readonly string[]): any => {
  if (!schema || keys.length === 0) {
    return schema
  }
  if (schema.properties) {
    const properties = Object.fromEntries(
      Object.entries(schema.properties).filter(([key]) => !keys.includes(key)),
    )
    return { ...schema, properties }
  }
  for (const field of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(schema[field])) {
      return {
        ...schema,
        [field]: schema[field].map((part: any) => omitProperties(part, keys)),
      }
    }
  }
  return schema
}

export const buildOpenAiManifest = (spec: unknown) => {
  const typedSpec = spec as Spec
  const tools = parseToolsFromSpec(spec as never)
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  const { sanitize, cleanSchema } = createDescriptionFilter(
    new Set<string>(OPENAI_API_TOOLS),
  )

  const missing = OPENAI_API_TOOLS.filter((name) => !byName.has(name))
  const entries = OPENAI_API_TOOLS.filter((name) => byName.has(name)).map(
    (name) => {
      const tool = byName.get(name) as (typeof tools)[number]
      const override = OPENAI_TOOL_OVERRIDES[name] ?? {}
      const keepsConfirm = (
        OPENAI_CONFIRMED_POLICIES as readonly string[]
      ).includes(tool.hitlPolicy)
      const removed = [
        ...(override.removeProperties ?? []),
        ...(keepsConfirm ? [] : ["_confirm"]),
      ]
      const properties = Object.fromEntries(
        Object.entries(tool.inputSchema.properties).filter(
          ([key]) => !removed.includes(key),
        ),
      )
      const required = (tool.inputSchema.required ?? []).filter(
        (key) => !removed.includes(key),
      )
      return {
        name,
        method: tool.method,
        pathTemplate: tool.pathTemplate,
        pathParamNames: tool.pathParamNames,
        queryParamNames: tool.queryParamNames,
        bodyParamNames: tool.bodyParamNames.filter(
          (key) => !removed.includes(key),
        ),
        description: override.description ?? sanitize(tool.description),
        annotations: { ...tool.annotations, ...override.annotations },
        hitlPolicy: keepsConfirm ? tool.hitlPolicy : "none",
        alwaysVisible: tool.alwaysVisible,
        ...(tool.scope === undefined ? {} : { scope: tool.scope }),
        adapterBody: override.adapterBody ?? {},
        inputSchema: strict(
          cleanSchema({
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
          }),
        ),
        responseSchema: strict(
          omitProperties(
            responseSchemaOf(typedSpec, tool.method, tool.pathTemplate),
            TRANSPORT_ONLY_RESPONSE_PROPERTIES[name] ?? [],
          ),
        ),
      }
    },
  )

  return { contractVersion: OPENAI_CONTRACT_VERSION, missing, tools: entries }
}
