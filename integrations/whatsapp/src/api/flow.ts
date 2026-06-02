import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"
import { logger } from "../lib/logger"
import type {
  FlowAssetsResponse,
  ListFlowsResponse,
  WhatsappAuthValue,
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
