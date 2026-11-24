import type { JsonSchema } from "./json-schema-validate"

/** Raised when an upstream body does not match its reviewed schema. */
export class ResponseContractError extends Error {}

/** Property names never forwarded to the OpenAI host, at any depth. */
const DENIED_PROPERTY_NAMES = new Set([
  "accesstoken",
  "additionalattributes",
  "apikey",
  "authorization",
  "clientsecret",
  "credentials",
  "gender",
  "latitude",
  "location",
  "longitude",
  "notes",
  "password",
  "privatenote",
  "providerdata",
  "rawdata",
  "rawpayload",
  "refreshtoken",
  "secret",
  "token",
  "webhooksecret",
])

const isDenied = (name: string): boolean =>
  DENIED_PROPERTY_NAMES.has(name.replace(/[^a-z]/gi, "").toLowerCase())

const jsonType = (value: unknown): string => {
  if (value === null) {
    return "null"
  }
  if (Array.isArray(value)) {
    return "array"
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number"
  }
  return typeof value
}

const typeMatches = (schema: JsonSchema, value: unknown): boolean => {
  const actual = jsonType(value)
  const expected = schema.type
  if (expected === undefined) {
    return true
  }
  return ([] as string[])
    .concat(expected as string | string[])
    .some(
      (type) => type === actual || (type === "number" && actual === "integer"),
    )
}

const subSchemas = (schema: JsonSchema): JsonSchema[] => [
  ...((schema.anyOf as JsonSchema[] | undefined) ?? []),
  ...((schema.oneOf as JsonSchema[] | undefined) ?? []),
]

const fail = (path: string, message: string): never => {
  throw new ResponseContractError(`${path}: ${message}`)
}

const projectNode = (
  schema: JsonSchema | undefined,
  value: unknown,
  path: string,
): unknown => {
  if (!schema || typeof schema !== "object") {
    return fail(path, "no schema")
  }
  const branches = subSchemas(schema)
  if (branches.length > 0) {
    // Project each branch exactly once; a throw means the branch does not match.
    const projected: unknown[] = []
    for (const branch of branches) {
      try {
        projected.push(projectNode(branch, value, path))
      } catch (error) {
        if (!(error instanceof ResponseContractError)) {
          throw error
        }
      }
    }
    if (projected.length === 0) {
      return fail(path, "matches no reviewed shape")
    }
    const objects = projected.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    )
    return objects.length === projected.length && objects.length > 1
      ? Object.assign({}, ...objects)
      : projected[0]
  }
  const allOf = (schema.allOf as JsonSchema[] | undefined) ?? []
  if (allOf.length > 0) {
    const parts = allOf.map((part) => projectNode(part, value, path))
    return parts.every(
      (part) =>
        part !== null && typeof part === "object" && !Array.isArray(part),
    )
      ? Object.assign({}, ...(parts as object[]))
      : parts[0]
  }
  const isUnconstrained =
    schema.type === undefined &&
    schema.properties === undefined &&
    !("const" in schema) &&
    schema.enum === undefined
  if (isUnconstrained) {
    // Unreviewed structure: scalars pass, nested objects/arrays are omitted.
    return value !== null && typeof value === "object" ? undefined : value
  }
  if (!typeMatches(schema, value)) {
    return fail(path, `expected ${String(schema.type)}, got ${jsonType(value)}`)
  }
  if (Array.isArray(value)) {
    return value
      .map((item, index) =>
        projectNode(
          schema.items as JsonSchema | undefined,
          item,
          `${path}[${index}]`,
        ),
      )
      .filter((item) => item !== undefined)
  }
  if (value !== null && typeof value === "object") {
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (isDenied(key) || !(key in properties)) {
        continue
      }
      const projected = projectNode(properties[key], child, `${path}.${key}`)
      if (projected !== undefined) {
        output[key] = projected
      }
    }
    return output
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return fail(path, "value outside reviewed enum")
  }
  return value
}

/** Copies only reviewed, permitted fields into a new value; never mutates. */
export const projectResponse = (
  schema: JsonSchema | null,
  value: unknown,
): unknown => {
  if (schema === null) {
    return value === undefined || value === ""
      ? { ok: true }
      : fail("$", "unexpected body")
  }
  const projected = projectNode(schema, value, "$")
  // An unreviewed (free-form) body is withheld entirely; report success
  // explicitly instead of a result with no text.
  return projected === undefined ? { ok: true } : projected
}
