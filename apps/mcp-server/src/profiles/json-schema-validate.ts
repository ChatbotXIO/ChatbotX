/**
 * Validates tool arguments against a reviewed JSON Schema (the subset Zod and
 * the OpenAPI generator emit). Unknown properties are rejected at every object
 * boundary that declares `properties`; dynamic maps are rejected outright.
 */
export type JsonSchema = {
  [key: string]: unknown
}

const MAX_DEPTH = 32

const typeOf = (value: unknown): string => {
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

const matchesType = (expected: string, actual: string): boolean =>
  expected === actual || (expected === "number" && actual === "integer")

const asSchemas = (value: unknown): JsonSchema[] =>
  Array.isArray(value) ? (value as JsonSchema[]) : []

const isDynamicMap = (schema: JsonSchema): boolean => {
  const additional = schema.additionalProperties
  return (
    schema.type === "object" &&
    !schema.properties &&
    additional !== false &&
    (additional === true || typeof additional === "object")
  )
}

export const validateAgainstSchema = (
  schema: JsonSchema | null | undefined,
  value: unknown,
  path = "$",
  depth = 0,
): string[] => {
  if (
    !schema ||
    typeof schema !== "object" ||
    Object.keys(schema).length === 0
  ) {
    // `{}` accepts anything in JSON Schema; the profile does not.
    return [`${path}: unconstrained value is not permitted`]
  }
  if (depth > MAX_DEPTH) {
    return [`${path}: nesting too deep`]
  }

  const errors: string[] = []
  const branches = [...asSchemas(schema.anyOf), ...asSchemas(schema.oneOf)]
  if (branches.length > 0) {
    const results = branches.map((branch) =>
      validateAgainstSchema(branch, value, path, depth + 1),
    )
    if (!results.some((result) => result.length === 0)) {
      errors.push(`${path}: does not match any allowed shape`)
    }
  }
  for (const part of asSchemas(schema.allOf)) {
    errors.push(...validateAgainstSchema(part, value, path, depth + 1))
  }
  if ("const" in schema && schema.const !== value) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`)
  }

  if (typeof schema.type === "string" || Array.isArray(schema.type)) {
    const expected = ([] as string[]).concat(schema.type as string | string[])
    const actual = typeOf(value)
    if (!expected.some((type) => matchesType(type, actual))) {
      errors.push(`${path}: expected ${expected.join("|")}, got ${actual}`)
      return errors
    }
  } else if (
    branches.length === 0 &&
    !schema.allOf &&
    !("const" in schema) &&
    !schema.enum
  ) {
    return [`${path}: schema has no type`]
  }

  if (typeof value === "string") {
    const { maxLength, minLength, pattern } = schema as {
      maxLength?: number
      minLength?: number
      pattern?: string
    }
    if (minLength !== undefined && value.length < minLength) {
      errors.push(`${path}: too short`)
    }
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push(`${path}: too long`)
    }
    if (pattern && !new RegExp(pattern, "u").test(value)) {
      errors.push(`${path}: invalid format`)
    }
  }
  if (typeof value === "number") {
    const { maximum, minimum } = schema as {
      maximum?: number
      minimum?: number
    }
    if (minimum !== undefined && value < minimum) {
      errors.push(`${path}: below minimum`)
    }
    if (maximum !== undefined && value > maximum) {
      errors.push(`${path}: above maximum`)
    }
  }
  if (Array.isArray(value)) {
    const { items, maxItems, minItems } = schema as {
      items?: JsonSchema
      maxItems?: number
      minItems?: number
    }
    if (minItems !== undefined && value.length < minItems) {
      errors.push(`${path}: too few items`)
    }
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push(`${path}: too many items`)
    }
    for (const [index, item] of value.entries()) {
      errors.push(
        ...validateAgainstSchema(items, item, `${path}[${index}]`, depth + 1),
      )
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (isDynamicMap(schema)) {
      errors.push(`${path}: free-form objects are not permitted`)
      return errors
    }
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    const record = value as Record<string, unknown>
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (record[key] === undefined) {
        errors.push(`${path}.${key}: required`)
      }
    }
    for (const [key, child] of Object.entries(record)) {
      const childSchema = properties[key]
      if (!childSchema) {
        errors.push(`${path}.${key}: unknown property`)
        continue
      }
      errors.push(
        ...validateAgainstSchema(
          childSchema,
          child,
          `${path}.${key}`,
          depth + 1,
        ),
      )
    }
  }
  return errors
}
