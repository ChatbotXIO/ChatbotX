// biome-ignore-all lint/suspicious/noExplicitAny: walks untyped OpenAPI JSON
/**
 * Generates src/profiles/openai-manifest.json from a public OpenAPI document.
 * Usage: tsx scripts/generate-openai-manifest.ts <public-spec.json>
 * The output is a reviewed contract: commit it, never regenerate at runtime.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { parseToolsFromSpec, toSnakeCase } from "../src/openapi-loader"
import {
  OPENAI_API_TOOLS,
  OPENAI_CONTRACT_VERSION,
  OPENAI_TOOL_OVERRIDES,
} from "../src/profiles/openai-contract"

type Spec = { paths: Record<string, Record<string, any>> }
const spec = JSON.parse(readFileSync(process.argv[2] as string, "utf8")) as Spec
const tools = parseToolsFromSpec(spec as never)
const byName = new Map(tools.map((tool) => [tool.name, tool]))

const outputSchema = (method: string, path: string): unknown => {
  const response = spec.paths[path]?.[method.toLowerCase()]?.responses ?? {}
  const ok = Object.entries(response).find(([code]) =>
    code.startsWith("2"),
  )?.[1]
  return ok?.content?.["application/json"]?.schema ?? null
}

const manifestNames = new Set<string>(OPENAI_API_TOOLS)
const SENTENCE_BREAK = /(?<=[.!?])\s+/
const SCOPE_LINE = /\n?\s*Requires token scope:[^\n]*/g
const BACKTICK_OP = /`([a-zA-Z]+\.[a-zA-Z]+)`/g
const toToolName = (operationId: string) => toSnakeCase(operationId)

/** Drops sentences that point at operations outside this profile. */
const sanitizeDescription = (text: string): string =>
  text
    .split(SENTENCE_BREAK)
    .filter((sentence) =>
      [...sentence.matchAll(BACKTICK_OP)].every((match) =>
        manifestNames.has(toToolName(match[1] as string)),
      ),
    )
    .join(" ")
    .replace(SCOPE_LINE, "")
    .trim()

/** Applies the same operation-reference filter to every nested description. */
const cleanDescriptions = (schema: any): any => {
  if (Array.isArray(schema)) {
    return schema.map(cleanDescriptions)
  }
  if (schema && typeof schema === "object") {
    const next: any = {}
    for (const [key, value] of Object.entries(schema)) {
      if (key === "description" && typeof value === "string") {
        const cleaned = sanitizeDescription(value)
        if (cleaned) {
          next[key] = cleaned
        }
      } else {
        next[key] = cleanDescriptions(value)
      }
    }
    return next
  }
  return schema
}

const strict = (schema: any): any => {
  if (Array.isArray(schema)) {
    return schema.map(strict)
  }
  if (schema && typeof schema === "object") {
    const next = Object.fromEntries(
      Object.entries(schema).map(([k, v]) => [k, strict(v)]),
    ) as any
    if (next.type === "object" && next.properties) {
      next.additionalProperties = false
    }
    return next
  }
  return schema
}

const omitProperties = (schema: any, keys: string[]): any => {
  if (!schema || keys.length === 0) {
    return schema
  }
  if (schema.properties) {
    const properties = { ...schema.properties }
    for (const key of keys) {
      delete properties[key]
    }
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

const entries = OPENAI_API_TOOLS.map((name) => {
  const tool = byName.get(name)
  if (!tool) {
    throw new Error(`Tool ${name} missing from spec`)
  }
  const override = OPENAI_TOOL_OVERRIDES[name] ?? {}
  const properties = { ...tool.inputSchema.properties } as Record<
    string,
    unknown
  >
  for (const key of override.removeProperties ?? []) {
    delete properties[key]
  }
  const required = (tool.inputSchema.required ?? []).filter(
    (key) => !(override.removeProperties ?? []).includes(key),
  )
  return {
    name,
    method: tool.method,
    pathTemplate: tool.pathTemplate,
    pathParamNames: tool.pathParamNames,
    queryParamNames: tool.queryParamNames,
    bodyParamNames: tool.bodyParamNames.filter(
      (key) => !(override.removeProperties ?? []).includes(key),
    ),
    description: override.description ?? sanitizeDescription(tool.description),
    annotations: { ...tool.annotations, ...override.annotations },
    hitlPolicy: tool.hitlPolicy,
    adapterBody: override.adapterBody ?? {},
    inputSchema: strict(
      cleanDescriptions({
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      }),
    ),
    responseSchema: strict(
      omitProperties(
        outputSchema(tool.method, tool.pathTemplate),
        override.omitResponseProperties ?? [],
      ),
    ),
  }
})

writeFileSync(
  new URL("../src/profiles/openai-manifest.json", import.meta.url),
  `${JSON.stringify({ contractVersion: OPENAI_CONTRACT_VERSION, tools: entries }, null, 2)}\n`,
)
console.log(`Wrote ${entries.length} tools`)
