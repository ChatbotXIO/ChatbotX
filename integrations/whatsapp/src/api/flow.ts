import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { parseOriginError, rescue, WhatsappException } from "../exception"
import { logger } from "../lib/logger"
import type {
  FlowAssetsResponse,
  ListFlowsResponse,
  WhatsappAuthValue,
  WhatsappFlow,
  WhatsappFlowScreen,
} from "../schema"

type JsonObject = Record<string, unknown>

const CAMEL_CASE_REGEX = /([a-z])([A-Z])/g
const FIRST_CHAR_REGEX = /^./

const buildAuthHeaders = (auth: WhatsappAuthValue) => ({
  Authorization: `Bearer ${auth.tokens.accessToken}`,
})

const humanizeKey = (key: string): string =>
  key
    .replace(/_/g, " ")
    .replace(CAMEL_CASE_REGEX, "$1 $2")
    .replace(FIRST_CHAR_REGEX, (c) => c.toUpperCase())

const forEachJsonNode = (
  node: unknown,
  visit: (obj: JsonObject) => void,
): void => {
  if (!node || typeof node !== "object") {
    return
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      forEachJsonNode(child, visit)
    }
    return
  }

  const obj = node as JsonObject
  visit(obj)

  for (const value of Object.values(obj)) {
    forEachJsonNode(value, visit)
  }
}

const readOnClickAction = (obj: JsonObject): JsonObject | undefined =>
  obj["on-click-action"] as JsonObject | undefined

const extractScreenOutputKeys = (layout: unknown): Set<string> => {
  const keys = new Set<string>()
  forEachJsonNode(layout, (obj) => {
    const action = readOnClickAction(obj)
    if (action?.name !== "complete" || !action.payload) {
      return
    }
    for (const key of Object.keys(action.payload as JsonObject)) {
      keys.add(key)
    }
  })
  return keys
}

const collectFieldLabels = (
  layout: unknown,
  acc: Map<string, string>,
): void => {
  forEachJsonNode(layout, (obj) => {
    const name = typeof obj.name === "string" ? obj.name : ""
    const label = typeof obj.label === "string" ? obj.label : null
    if (name && label && !acc.has(name)) {
      acc.set(name, label)
    }
  })
}

const collectNavigationTargets = (layout: unknown): Set<string> => {
  const targets = new Set<string>()
  forEachJsonNode(layout, (obj) => {
    const action = readOnClickAction(obj)
    const next = action?.next as JsonObject | undefined
    if (
      action?.name === "navigate" &&
      next?.type === "screen" &&
      typeof next.name === "string"
    ) {
      targets.add(next.name)
    }
  })
  return targets
}

const getReachableScreenIds = (
  startScreenId: string,
  routes: Map<string, string[]>,
): Set<string> => {
  const reachable = new Set<string>()
  const pending = [startScreenId]

  while (pending.length > 0) {
    const screenId = pending.pop()
    if (!screenId || reachable.has(screenId)) {
      continue
    }

    reachable.add(screenId)
    for (const nextScreenId of routes.get(screenId) ?? []) {
      pending.push(nextScreenId)
    }
  }

  return reachable
}

const getScreenRoutes = (
  screenId: string,
  layout: unknown,
  routingModel: JsonObject | undefined,
): string[] => {
  const routingTargets = routingModel?.[screenId]
  if (Array.isArray(routingTargets)) {
    return routingTargets.filter(
      (target): target is string => typeof target === "string",
    )
  }
  return Array.from(collectNavigationTargets(layout))
}

type ScreenIndex = {
  outputs: Map<string, Set<string>>
  routes: Map<string, string[]>
  labels: Map<string, string>
}

const buildScreenIndex = (
  screens: unknown[],
  routingModel: JsonObject | undefined,
): ScreenIndex => {
  const outputs = new Map<string, Set<string>>()
  const routes = new Map<string, string[]>()
  const labels = new Map<string, string>()

  for (const screen of screens) {
    const s = screen as { id?: string; layout?: unknown }
    if (!s.id) {
      continue
    }

    outputs.set(s.id, extractScreenOutputKeys(s.layout))
    collectFieldLabels(s.layout, labels)
    routes.set(s.id, getScreenRoutes(s.id, s.layout, routingModel))
  }

  return { outputs, routes, labels }
}

const getScreenOutputs = (
  screenId: string,
  index: ScreenIndex,
): WhatsappFlowScreen["output"] => {
  const outputKeys = new Set<string>()
  for (const reachableId of getReachableScreenIds(screenId, index.routes)) {
    for (const key of index.outputs.get(reachableId) ?? []) {
      outputKeys.add(key)
    }
  }

  return Array.from(outputKeys).map((key) => ({
    value: key,
    label: index.labels.get(key) ?? humanizeKey(key),
  }))
}

export const parseFlowScreens = (json: unknown): WhatsappFlowScreen[] => {
  if (!json || typeof json !== "object") {
    return []
  }

  const root = json as { screens?: unknown[]; routing_model?: JsonObject }
  if (!Array.isArray(root.screens)) {
    return []
  }

  const index = buildScreenIndex(root.screens, root.routing_model)

  return root.screens.map((screen) => {
    const s = screen as { id?: string; title?: string; terminal?: boolean }
    const id = s.id ?? ""
    return {
      id,
      title: s.title ?? id,
      terminal: Boolean(s.terminal),
      output: getScreenOutputs(id, index),
    }
  })
}

export async function getFlowAssets({
  auth,
  flowSourceId,
}: {
  auth: WhatsappAuthValue
  flowSourceId: string
}): Promise<WhatsappFlowScreen[]> {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    const assets = await ky
      .get<FlowAssetsResponse>(`${API_URL}/${version}/${flowSourceId}/assets`, {
        headers: buildAuthHeaders(auth),
      })
      .json()

    const flowJsonAsset = assets.data.find(
      (a) => a.asset_type === "FLOW_JSON" || a.name?.endsWith(".json"),
    )
    if (!flowJsonAsset?.download_url) {
      return []
    }

    const flowJson = await ky.get(flowJsonAsset.download_url).json()
    return parseFlowScreens(flowJson)
  } catch (err) {
    logger.error({ err }, "Failed to load flow assets")
    return []
  }
}

export async function listFlows({
  auth,
}: {
  auth: WhatsappAuthValue
}): Promise<ListFlowsResponse> {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
      .get<ListFlowsResponse>(
        `${API_URL}/${version}/${auth.metadata.wabaId}/flows`,
        { headers: buildAuthHeaders(auth) },
      )
      .json()
  } catch (err) {
    logger.error({ err }, "Failed to list flows")
    throw new WhatsappException("Failed to list flows").setOriginError(err)
  }
}

const FLOW_FIELDS = "id,name,status,categories,validation_errors"

/** Flows that can still take a new Flow JSON in place. */
const EDITABLE_FLOW_STATUSES = new Set(["DRAFT", "PUBLISHED"])

export type WhatsappFlowCategory =
  | "SIGN_UP"
  | "SIGN_IN"
  | "APPOINTMENT_BOOKING"
  | "LEAD_GENERATION"
  | "CONTACT_US"
  | "CUSTOMER_SUPPORT"
  | "SURVEY"
  | "OTHER"

export type PublishFlowJsonParams = {
  name: string
  flowJson: string
  categories?: WhatsappFlowCategory[]
  /** Meta id of a Flow created by an earlier publish of the same Mini App. */
  existingFlowId?: string | null
}

export type PublishFlowJsonResult = {
  flow: WhatsappFlow
  /**
   * False when Meta kept the Flow as a draft: validation errors (on
   * `flow.validation_errors`) or a refused publish (on `publishError`).
   */
  published: boolean
  /** Why Meta refused to publish a Flow with no validation errors. */
  publishError?: string
}

type FlowWriteResponse = {
  id?: string
  success?: boolean
  validation_errors?: unknown[]
}

const getFlow = (auth: WhatsappAuthValue, flowId: string) => {
  const { version = DEFAULT_API_VERSION } = auth
  return ky
    .get<WhatsappFlow>(`${API_URL}/${version}/${flowId}`, {
      headers: buildAuthHeaders(auth),
      searchParams: { fields: FLOW_FIELDS },
    })
    .json()
}

const createFlow = (
  auth: WhatsappAuthValue,
  params: PublishFlowJsonParams,
): Promise<FlowWriteResponse> => {
  const { version = DEFAULT_API_VERSION } = auth
  return ky
    .post<FlowWriteResponse>(
      `${API_URL}/${version}/${auth.metadata.wabaId}/flows`,
      {
        headers: buildAuthHeaders(auth),
        json: {
          name: params.name,
          categories: params.categories?.length ? params.categories : ["OTHER"],
          flow_json: params.flowJson,
        },
      },
    )
    .json()
}

const updateFlowJson = (
  auth: WhatsappAuthValue,
  flowId: string,
  flowJson: string,
): Promise<FlowWriteResponse> => {
  const { version = DEFAULT_API_VERSION } = auth
  const body = new FormData()
  body.append(
    "file",
    new Blob([flowJson], { type: "application/json" }),
    "flow.json",
  )
  body.append("name", "flow.json")
  body.append("asset_type", "FLOW_JSON")
  return ky
    .post<FlowWriteResponse>(`${API_URL}/${version}/${flowId}/assets`, {
      headers: buildAuthHeaders(auth),
      body,
    })
    .json()
}

const publishFlow = (auth: WhatsappAuthValue, flowId: string) => {
  const { version = DEFAULT_API_VERSION } = auth
  return ky
    .post<{ success?: boolean }>(`${API_URL}/${version}/${flowId}/publish`, {
      headers: buildAuthHeaders(auth),
    })
    .json()
}

const hasErrors = (response: FlowWriteResponse) =>
  (response.validation_errors?.length ?? 0) > 0

const PUBLISH_REFUSED_MESSAGE = "Meta did not publish the Flow"

/** Calls `/publish`; returns Meta's reason when it refuses, else undefined. */
const tryPublish = async (
  auth: WhatsappAuthValue,
  flowId: string,
): Promise<string | undefined> => {
  try {
    const response = await publishFlow(auth, flowId)
    return response.success === false ? PUBLISH_REFUSED_MESSAGE : undefined
  } catch (err) {
    // Publishing checks (business verification, connected app, …) can
    // refuse a Flow whose JSON is valid.
    logger.warn({ err, flowId }, "Meta refused to publish the Flow")
    const origin = parseOriginError(err)
    return origin.userMessage ?? origin.message ?? PUBLISH_REFUSED_MESSAGE
  }
}

/**
 * Publishes a Flow whose JSON was just written without validation errors.
 * A new Flow starts as DRAFT, and writing new JSON to a published Flow turns
 * it back to DRAFT, so a Flow read as DRAFT is published here. A refused
 * publish returns the draft with `publishError` instead of throwing, so the
 * caller still records the Flow and the next attempt reuses it.
 */
const publishDraft = async (
  auth: WhatsappAuthValue,
  flowId: string,
): Promise<PublishFlowJsonResult> => {
  const current = await getFlow(auth, flowId)
  if (current.status !== "DRAFT") {
    return { flow: current, published: current.status === "PUBLISHED" }
  }
  const publishError = await tryPublish(auth, flowId)
  const flow = await getFlow(auth, flowId)
  if (publishError) {
    return { flow, published: false, publishError }
  }
  // Meta accepted the publish; a read right after it can still say DRAFT.
  return { flow: { ...flow, status: "PUBLISHED" }, published: true }
}

/** Updates an editable Flow in place; returns undefined when it cannot be reused. */
const tryUpdateExisting = async (
  auth: WhatsappAuthValue,
  flowId: string,
  flowJson: string,
): Promise<PublishFlowJsonResult | undefined> => {
  const current = await getFlow(auth, flowId).catch(() => undefined)
  if (!(current && EDITABLE_FLOW_STATUSES.has(current.status))) {
    return
  }
  try {
    const update = await updateFlowJson(auth, flowId, flowJson)
    if (hasErrors(update)) {
      return { flow: await getFlow(auth, flowId), published: false }
    }
  } catch (err) {
    // Older published Flows are immutable: fall back to a fresh Flow.
    logger.warn(
      { err, flowId },
      "Flow JSON update rejected, creating a new Flow",
    )
    return
  }
  return await publishDraft(auth, flowId)
}

/**
 * Creates (or updates) a WhatsApp Flow from a Flow JSON and publishes it.
 * Reuses `existingFlowId` while Meta still allows editing it; otherwise
 * creates a new Flow. Meta's validation errors keep the Flow as a draft and
 * come back on `flow.validation_errors`. `published` is the source of truth;
 * `flow.status` is only what Meta reported right after the call.
 */
export function publishFlowJson({
  auth,
  params,
}: {
  auth: WhatsappAuthValue
  params: PublishFlowJsonParams
}): Promise<PublishFlowJsonResult> {
  return rescue(async () => {
    if (params.existingFlowId) {
      const updated = await tryUpdateExisting(
        auth,
        params.existingFlowId,
        params.flowJson,
      )
      if (updated) {
        return updated
      }
    }
    const created = await createFlow(auth, params)
    if (!created.id) {
      throw new WhatsappException("Meta did not return a Flow id")
    }
    if (hasErrors(created)) {
      return { flow: await getFlow(auth, created.id), published: false }
    }
    return await publishDraft(auth, created.id)
  })
}
