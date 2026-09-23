import { once } from "node:events"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import type { AddressInfo } from "node:net"
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv"
import type { JsonSchemaType } from "@modelcontextprotocol/sdk/validation/types"

export type HttpTrace = {
  method: string
  operationId?: string
  path: string
  query: Record<string, string | string[]>
  body: unknown
  status: number
}

type JsonSchema = Record<string, unknown>
type SpecOperation = {
  operationId?: string
  parameters?: Array<{
    in?: "path" | "query"
    name?: string
    required?: boolean
    schema?: JsonSchema
  }>
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>
  }
}
type Operation = {
  definition: SpecOperation
  method: string
  operationId: string
  path: string
}
type OpenApiSpec = {
  components?: Record<string, unknown>
  paths?: Record<string, Record<string, SpecOperation>>
}
type Contact = {
  id: number
  name: string
  email: string
  phone?: string
  tags: string[]
}
type FixtureState = {
  contacts: Contact[]
  appointments: Record<string, "booked" | "cancelled">
  issuedCouponUsed: boolean
  product: { addons: unknown[]; id: number; name: string; variants: unknown[] }
}
type RequestData = {
  body: Record<string, unknown>
  path: string
  query: Record<string, string | string[]>
}
type FixtureResult = { status: number; value: unknown }
type FixtureHandler = (
  state: FixtureState,
  request: RequestData,
) => FixtureResult

const apiPathPrefix = /^\/api/

const initialState = (): FixtureState => ({
  contacts: [
    {
      id: 11,
      name: "Ada",
      email: "ada@example.com",
      phone: "+841234567890",
      tags: ["Newsletter"],
    },
    { id: 12, name: "An", email: "an@example.com", tags: ["Newsletter"] },
    { id: 13, name: "An", email: "another.an@example.com", tags: [] },
  ],
  appointments: { "99": "booked" },
  issuedCouponUsed: false,
  product: {
    id: 4,
    name: "Áo",
    variants: [{ id: 1, name: "M" }],
    addons: [{ id: 2, name: "Gift" }],
  },
})

const ok = (value: unknown): FixtureResult => ({ status: 200, value })
const invalid = (error: string): FixtureResult => ({
  status: 422,
  value: { error },
})
const notFound = (error: string): FixtureResult => ({
  status: 404,
  value: { error },
})
const has = (value: Record<string, unknown>, ...keys: string[]): boolean =>
  keys.every((key) => value[key] !== undefined && value[key] !== null)
const idFrom = (path: string): string => path.split("/").at(-1) ?? ""
const identifierContact = (
  state: FixtureState,
  identifier: unknown,
): Contact | undefined => {
  if (typeof identifier !== "string") {
    return
  }
  if (identifier.startsWith("id:")) {
    return state.contacts.find(
      (contact) => String(contact.id) === identifier.slice(3),
    )
  }
  if (identifier.startsWith("email:")) {
    return state.contacts.find(
      (contact) => contact.email === identifier.slice(6),
    )
  }
  if (identifier.startsWith("phone:")) {
    return state.contacts.find(
      (contact) => contact.phone === identifier.slice(6),
    )
  }
  return
}

const noInput =
  (operationId: string): FixtureHandler =>
  () =>
    ok({ ok: true, operationId })

const fixtures: Record<string, FixtureHandler> = {
  "contacts.list": (state) =>
    ok({ data: state.contacts, count: state.contacts.length }),
  "contacts.get": (state, request) => {
    const contact = identifierContact(
      state,
      decodeURIComponent(idFrom(request.path)),
    )
    return contact ? ok(contact) : notFound("contactNotFound")
  },
  "contacts.listTags": (state) => ok({ data: state.contacts[0]?.tags ?? [] }),
  "contacts.sendMessage": (state, request) => {
    const contact = identifierContact(state, idFrom(request.path))
    return contact && has(request.body, "text")
      ? ok({ contactId: contact.id, status: "queued" })
      : invalid("prefixedIdentifierAndTextRequired")
  },
  "contacts.sendFlow": (_state, request) =>
    has(request.body, "flowId")
      ? ok({ status: "queued" })
      : invalid("flowIdRequired"),
  "contacts.triggerAutoReply": (_state, request) =>
    has(request.body, "keyword")
      ? ok({ status: "completed" })
      : invalid("keywordRequired"),
  "contacts.addTagsByName": (state, request) => {
    const contact = identifierContact(state, request.body.identifier)
    const tags = request.body.tags
    if (
      !(contact && Array.isArray(tags)) ||
      tags.some((tag) => typeof tag !== "string")
    ) {
      return invalid("prefixedIdentifierAndTagsRequired")
    }
    contact.tags = [...new Set([...contact.tags, ...tags])]
    return ok(contact)
  },
  "contacts.removeTags": (state, request) => {
    const contact = identifierContact(state, request.body.identifier)
    const tagIds = request.body.tagIds
    if (!(contact && Array.isArray(tagIds))) {
      return invalid("prefixedIdentifierAndTagIdsRequired")
    }
    contact.tags = contact.tags.filter((tag) => !tagIds.includes(tag))
    return ok(contact)
  },
  "contacts.setTags": (state, request) => {
    const contact = identifierContact(state, request.body.identifier)
    if (!(contact && Array.isArray(request.body.tagIds))) {
      return invalid("prefixedIdentifierAndTagIdsRequired")
    }
    contact.tags = request.body.tagIds.filter(
      (tag): tag is string => typeof tag === "string",
    )
    return ok(contact)
  },
  "contacts.subscribeSequences": (_state, request) =>
    has(request.body, "identifier", "sequenceIds")
      ? ok({ status: "subscribed" })
      : invalid("identifierAndSequenceIdsRequired"),
  "contacts.unsubscribeSequences": (_state, request) =>
    has(request.body, "identifier", "sequenceIds")
      ? ok({ status: "unsubscribed" })
      : invalid("identifierAndSequenceIdsRequired"),
  "tags.list": () =>
    ok({
      data: [
        { id: "VIP", name: "VIP" },
        { id: "Newsletter", name: "Newsletter" },
      ],
    }),
  "tags.create": (_state, request) =>
    has(request.body, "name")
      ? ok({ id: "VIP", name: request.body.name })
      : invalid("nameRequired"),
  "messages.create": (_state, request) =>
    has(request.body, "conversationId")
      ? ok({ status: "queued" })
      : invalid("conversationIdRequired"),
  "flows.list": () => ok({ data: [{ id: 15, name: "Tư vấn" }] }),
  "flows.get": () => ok({ id: 15, name: "Tư vấn", status: "draft" }),
  "flows.create": (_state, request) =>
    Object.keys(request.body).length > 0
      ? ok({ id: 16, status: "draft" })
      : invalid("flowDefinitionRequired"),
  "flows.validate": () => ok({ valid: true }),
  "flows.publish": () => ok({ status: "published" }),
  "flows.updateDraft": () => ok({ status: "draftUpdated" }),
  "broadcasts.get": () => ok({ id: 12, status: "draft" }),
  "broadcasts.getAudience": () => ok({ data: [{ id: 11, name: "Ada" }] }),
  "broadcasts.create": (_state, request) =>
    Object.keys(request.body).length > 0
      ? ok({ id: 12, status: "draft" })
      : invalid("broadcastPayloadRequired"),
  "broadcasts.schedule": () => ok({ id: 12, status: "scheduled" }),
  "sequences.list": () => ok({ data: [{ id: 7, name: "chăm sóc" }] }),
  "sequences.create": (_state, request) =>
    Object.keys(request.body).length > 0
      ? ok({ id: 7 })
      : invalid("sequencePayloadRequired"),
  "sequences.upsertStep": (_state, request) =>
    has(request.body, "sequenceId")
      ? ok({ status: "stepSaved" })
      : invalid("sequenceIdRequired"),
  "keywords.list": () => ok({ data: [{ id: 8, type: "outbound" }] }),
  "keywords.create": (_state, request) =>
    request.body.type === "inbound" || request.body.type === "outbound"
      ? ok({ id: 8, type: request.body.type })
      : invalid("keywordDirectionRequired"),
  "keywords.updateStatus": (_state, request) =>
    request.body.type === "outbound" || request.body.type === "inbound"
      ? ok({ status: "updated" })
      : invalid("keywordDirectionRequired"),
  "fbComments.listPosts": () =>
    ok({ data: [{ id: "post-1", title: "Bài X" }] }),
  "fbComments.get": () =>
    ok({ id: 3, hideComments: false, publicReply: "Cảm ơn" }),
  "fbComments.update": () => ok({ status: "updated" }),
  "products.list": () => ok({ data: [{ id: 4, name: "Áo" }] }),
  "products.get": (state) => ok(state.product),
  "products.create": (_state, request) =>
    Object.keys(request.body).length > 0
      ? ok({ id: 5 })
      : invalid("productPayloadRequired"),
  "products.update": (state, request) => {
    if (!has(request.body, "variants", "addons")) {
      return invalid("fullProductReplacementRequired")
    }
    state.product = {
      ...state.product,
      ...request.body,
    } as FixtureState["product"]
    return ok(state.product)
  },
  "coupons.listTopics": () => ok({ data: [{ id: 2, name: "mùa hè" }] }),
  "coupons.listCoupons": () =>
    ok({ data: [{ id: 30, contactId: 11, usedAt: null }] }),
  "coupons.createTopic": (_state, request) =>
    Object.keys(request.body).length > 0
      ? ok({ id: 2 })
      : invalid("topicPayloadRequired"),
  "coupons.issueCoupon": (_state, request) =>
    has(request.body, "topicId", "contactId")
      ? ok({ id: 30, status: "issued" })
      : invalid("topicIdAndContactIdRequired"),
  "coupons.markCouponUsed": (state) => {
    if (state.issuedCouponUsed) {
      return notFound("noIssuedCoupon")
    }
    state.issuedCouponUsed = true
    return ok({ status: "used" })
  },
  "appointments.list": () =>
    ok({ data: [{ id: 99, startAt: "2026-09-24T09:00:00+07:00" }] }),
  "appointments.get": () => ok({ id: 99, status: "booked" }),
  "appointments.book": (_state, request) => {
    if (!has(request.body, "calendarId", "contactId", "startAt")) {
      return invalid("calendarIdContactIdAndStartAtRequired")
    }
    return String(request.body.startAt).includes("T00:00")
      ? invalid("slotUnavailable")
      : ok({ id: 100, status: "booked" })
  },
  "appointments.cancel": (state, request) => {
    const id = idFrom(request.path)
    if (state.appointments[id] !== "booked") {
      return notFound("appointmentNotFound")
    }
    state.appointments[id] = "cancelled"
    return ok({ id: Number(id), status: "cancelled" })
  },
  "analytics.newContactsCount": noInput("analytics.newContactsCount"),
  "analytics.contactsCount": noInput("analytics.contactsCount"),
  "analytics.activeContactsCount": noInput("analytics.activeContactsCount"),
  "analytics.contactsByDimension": noInput("analytics.contactsByDimension"),
}

const readBody = async (
  request: IncomingMessage,
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  if (chunks.length === 0) {
    return {}
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >
  } catch {
    return {}
  }
}

const queryFrom = (url: URL): Record<string, string | string[]> => {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of url.searchParams) {
    const existing = query[key]
    if (existing === undefined) {
      query[key] = value
      continue
    }
    query[key] = Array.isArray(existing)
      ? [...existing, value]
      : [existing, value]
  }
  return query
}

const jsonSchemaValidator = new AjvJsonSchemaValidator()

const remapLocalReferences = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(remapLocalReferences)
  }
  if (!value || typeof value !== "object") {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (
        key === "$ref" &&
        typeof child === "string" &&
        child.startsWith("#/components/schemas/")
      ) {
        return [key, child.replace("#/components/schemas/", "#/$defs/")]
      }
      return [key, remapLocalReferences(child)]
    }),
  )
}

const schemaError = (
  schema: JsonSchema,
  value: unknown,
  spec: OpenApiSpec,
): string | undefined => {
  try {
    const components = remapLocalReferences(
      (spec.components?.schemas ?? {}) as JsonSchema,
    ) as JsonSchema
    const remappedSchema = remapLocalReferences(schema) as JsonSchema
    const result = jsonSchemaValidator.getValidator({
      ...remappedSchema,
      $defs: components,
    } as JsonSchemaType)(value)
    return result.valid ? undefined : result.errorMessage
  } catch (error) {
    return error instanceof Error ? error.message : "Schema validation failed."
  }
}
const pathParameters = (
  template: string,
  path: string,
): Record<string, string> => {
  const names = [...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])
  const pattern = template
    .replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
    .replace(/\\\{[^}]+\\\}/g, "([^/]+)")
  const match = new RegExp(`^${pattern}$`).exec(path)
  return Object.fromEntries(
    names.map((name, index) => [
      name,
      decodeURIComponent(match?.[index + 1] ?? ""),
    ]),
  )
}

const validateRequest = (
  operation: Operation,
  path: string,
  query: Record<string, string | string[]>,
  body: Record<string, unknown>,
  spec: OpenApiSpec,
): string | undefined => {
  const pathValues = pathParameters(operation.path, path)
  for (const parameter of operation.definition.parameters ?? []) {
    if (!(parameter.name && parameter.schema)) {
      continue
    }
    let value: string | string[] | undefined
    if (parameter.in === "path") {
      value = pathValues[parameter.name]
    } else if (parameter.in === "query") {
      value = query[parameter.name]
    }
    if (parameter.required && value === undefined) {
      return `Missing required ${parameter.in} parameter: ${parameter.name}`
    }
    if (value === undefined) {
      continue
    }
    const error = schemaError(parameter.schema, value, spec)
    if (error) {
      return `Invalid ${parameter.in} parameter ${parameter.name}: ${error}`
    }
  }

  const bodySchema =
    operation.definition.requestBody?.content?.["application/json"]?.schema
  if (!bodySchema) {
    return
  }
  const error = schemaError(bodySchema, body, spec)
  return error ? `Invalid request body: ${error}` : undefined
}

const operationsFrom = (spec: OpenApiSpec): Operation[] =>
  Object.entries(spec.paths ?? {}).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(
        ([method, operation]) =>
          ["get", "post", "put", "patch", "delete"].includes(method) &&
          operation.operationId,
      )
      .map(([method, definition]) => ({
        definition,
        method: method.toUpperCase(),
        operationId: definition.operationId as string,
        path,
      })),
  )

const operationFor = (
  operations: Operation[],
  method: string,
  path: string,
): Operation | undefined =>
  operations.find((operation) => {
    if (operation.method !== method) {
      return false
    }
    const expression = operation.path
      .replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
      .replace(/\\\{[^}]+\\\}/g, "[^/]+")
    return new RegExp(`^${expression}$`).test(path)
  })

const send = (
  response: ServerResponse,
  status: number,
  value: unknown,
): void => {
  response.writeHead(status, { "Content-Type": "application/json" })
  response.end(JSON.stringify(value))
}

export type Sandbox = {
  baseUrl: string
  traces: HttpTrace[]
  close: () => Promise<void>
}

export const createSandbox = async (spec: OpenApiSpec): Promise<Sandbox> => {
  const state = initialState()
  const operations = operationsFrom(spec)
  const traces: HttpTrace[] = []
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/api/public-spec.json") {
      return send(response, 200, spec)
    }
    if (url.pathname === "/api/v1/token") {
      return send(response, 200, {
        workspaceId: "eval-workspace",
        permission: "full",
        scopes: null,
      })
    }
    const operation = operationFor(
      operations,
      request.method ?? "GET",
      url.pathname.replace(apiPathPrefix, ""),
    )
    const body = await readBody(request)
    const trace: HttpTrace = {
      method: request.method ?? "GET",
      operationId: operation?.operationId,
      path: url.pathname,
      query: queryFrom(url),
      body,
      status: 404,
    }
    traces.push(trace)
    if (!(operation && fixtures[operation.operationId])) {
      return send(response, 404, { error: "Unsupported synthetic operation" })
    }
    const validationError = validateRequest(
      operation,
      url.pathname.replace(apiPathPrefix, ""),
      trace.query,
      body,
      spec,
    )
    if (validationError) {
      trace.status = 422
      return send(response, 422, { error: validationError })
    }
    const result = fixtures[operation.operationId](state, {
      body,
      path: url.pathname,
      query: trace.query,
    })
    trace.status = result.status
    return send(response, result.status, result.value)
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api`,
    traces,
    close: async () => {
      server.close()
      await once(server, "close")
    },
  }
}
