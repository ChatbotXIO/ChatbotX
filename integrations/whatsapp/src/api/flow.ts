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

/** One question of a Flow's response, as the Flow JSON labels it. */
export type WhatsappFlowResponseField = {
  /** The key in the response (`response_json`). */
  key: string
  label: string
  /** Option id → title, for a static `data-source`. */
  options: Record<string, string>
  /** False when no component matched, so `label` is the humanized key. */
  labelled: boolean
}

type FlowComponentInfo = {
  label: string | null
  options: Record<string, string>
}

// `${form.X}` or `${screen.SCREEN_ID.form.X}`: the input a complete payload
// value reads from. Anything else (data, literals) has no component.
const FORM_REFERENCE_REGEX = /^\$\{(?:screen\.([^.}]+)\.)?form\.([^}]+)\}$/

const readStaticLabel = (value: unknown): string | null =>
  typeof value === "string" && value.trim() && !value.includes("${")
    ? value
    : null

const readStaticOptions = (dataSource: unknown): Record<string, string> => {
  const options: Record<string, string> = {}
  if (!Array.isArray(dataSource)) {
    return options
  }
  for (const option of dataSource) {
    if (
      option &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.title === "string"
    ) {
      options[option.id] = option.title
    }
  }
  return options
}

type FlowComponentIndex = {
  /** Screen id → input name → component. */
  byScreen: Map<string, Map<string, FlowComponentInfo>>
  /** Input name → the first component with a static label, else the first. */
  byName: Map<string, FlowComponentInfo>
}

const readScreenId = (screen: unknown): string => {
  const id = (screen as { id?: unknown }).id
  return typeof id === "string" ? id : ""
}

const indexFlowComponents = (screens: unknown[]): FlowComponentIndex => {
  const byScreen = new Map<string, Map<string, FlowComponentInfo>>()
  const byName = new Map<string, FlowComponentInfo>()
  for (const screen of screens) {
    const screenComponents = new Map<string, FlowComponentInfo>()
    byScreen.set(readScreenId(screen), screenComponents)
    forEachJsonNode((screen as { layout?: unknown }).layout, (obj) => {
      const name = typeof obj.name === "string" ? obj.name : ""
      // A navigate target (`next: { type: "screen", name }`) is no input.
      if (!name || typeof obj.type !== "string" || obj.type === "screen") {
        return
      }
      const info: FlowComponentInfo = {
        label: readStaticLabel(obj.label),
        options: readStaticOptions(obj["data-source"]),
      }
      if (!screenComponents.has(name)) {
        screenComponents.set(name, info)
      }
      const known = byName.get(name)
      if (!known || (!known.label && info.label)) {
        byName.set(name, info)
      }
    })
  }
  return { byScreen, byName }
}

type CompletePayloadEntry = { screenId: string; value: unknown }

const collectCompletePayloads = (
  screens: unknown[],
): Map<string, CompletePayloadEntry> => {
  const payload = new Map<string, CompletePayloadEntry>()
  for (const screen of screens) {
    const screenId = readScreenId(screen)
    forEachJsonNode((screen as { layout?: unknown }).layout, (obj) => {
      const action = readOnClickAction(obj)
      if (action?.name !== "complete" || !action.payload) {
        return
      }
      for (const [key, value] of Object.entries(action.payload as JsonObject)) {
        if (!payload.has(key)) {
          payload.set(key, { screenId, value })
        }
      }
    })
  }
  return payload
}

/** The component a payload value reads, on the screen it names (or its own). */
const findReferencedComponent = (
  key: string,
  entry: CompletePayloadEntry,
  index: FlowComponentIndex,
): FlowComponentInfo | undefined => {
  const match =
    typeof entry.value === "string"
      ? FORM_REFERENCE_REGEX.exec(entry.value)
      : null
  if (!match) {
    return index.byName.get(key)
  }
  const [, referencedScreenId, name] = match
  const onScreen = index.byScreen
    .get(referencedScreenId ?? entry.screenId)
    ?.get(name ?? "")
  // Another screen's same-named input is a guess, used only when the named
  // screen has no such input (e.g. a hand-written Flow with a stale screen id).
  return onScreen ?? index.byName.get(name ?? "")
}

/**
 * Labels for a Flow's response keys. A key is whatever the `complete`
 * payload names it, which need not match the input's `name`
 * (`{ "full_name": "${form.name_input}" }`), so each key is traced through its
 * `${form.X}` / `${screen.S.form.X}` reference to the component that holds the
 * label, on that screen first since names may repeat across screens. Flows
 * that finish through an endpoint have no `complete` payload, so none of their
 * keys are listed here.
 */
export const parseFlowResponseFields = (
  json: unknown,
): WhatsappFlowResponseField[] => {
  const screens = (json as { screens?: unknown } | null)?.screens
  if (!Array.isArray(screens)) {
    return []
  }
  const index = indexFlowComponents(screens)
  return Array.from(collectCompletePayloads(screens), ([key, entry]) => {
    const component = findReferencedComponent(key, entry, index)
    return {
      key,
      label: component?.label ?? humanizeKey(key),
      options: component?.options ?? {},
      labelled: Boolean(component?.label),
    }
  })
}

const downloadFlowJson = async (
  auth: WhatsappAuthValue,
  flowSourceId: string,
): Promise<unknown> => {
  const { version = DEFAULT_API_VERSION } = auth
  const assets = await ky
    .get<FlowAssetsResponse>(`${API_URL}/${version}/${flowSourceId}/assets`, {
      headers: buildAuthHeaders(auth),
    })
    .json()

  const flowJsonAsset = assets.data.find(
    (a) => a.asset_type === "FLOW_JSON" || a.name?.endsWith(".json"),
  )
  if (!flowJsonAsset?.download_url) {
    return null
  }
  return await ky.get(flowJsonAsset.download_url).json()
}

export async function getFlowAssets({
  auth,
  flowSourceId,
}: {
  auth: WhatsappAuthValue
  flowSourceId: string
}): Promise<WhatsappFlowScreen[]> {
  try {
    return parseFlowScreens(await downloadFlowJson(auth, flowSourceId))
  } catch (err) {
    logger.error({ err }, "Failed to load flow assets")
    return []
  }
}

/** Response labels of a published Flow; empty when Meta cannot serve its JSON. */
export async function getFlowResponseFields({
  auth,
  flowSourceId,
}: {
  auth: WhatsappAuthValue
  flowSourceId: string
}): Promise<WhatsappFlowResponseField[]> {
  try {
    return parseFlowResponseFields(await downloadFlowJson(auth, flowSourceId))
  } catch (err) {
    logger.warn({ err, flowSourceId }, "Failed to load flow response labels")
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

/** Statuses of a published Flow, still live for the templates and steps using it. */
const LIVE_FLOW_STATUSES = new Set(["PUBLISHED", "THROTTLED", "BLOCKED"])

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
  /**
   * False saves the Flow JSON as a draft on Meta without publishing it, so
   * it can be previewed (and deleted) before going live. Defaults to true.
   */
  publish?: boolean
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
  /**
   * True when a draft save (`publish: false`) hit a Flow that is live on
   * Meta: nothing was written, so the live Flow keeps serving as it is.
   */
  refusedLive?: boolean
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

/** The Flow as saved, unpublished; `published` reports whether it is live. */
const readDraft = async (
  auth: WhatsappAuthValue,
  flowId: string,
): Promise<PublishFlowJsonResult> => {
  const flow = await getFlow(auth, flowId)
  return { flow, published: flow.status === "PUBLISHED" }
}

/** Updates an editable Flow in place; returns undefined when it cannot be reused. */
const tryUpdateExisting = async (
  auth: WhatsappAuthValue,
  flowId: string,
  flowJson: string,
  publish: boolean,
): Promise<PublishFlowJsonResult | undefined> => {
  const current = await getFlow(auth, flowId).catch((err: unknown) => {
    // A draft save that cannot tell whether the Flow is live must not create
    // a new one in its place; only a Flow gone from Meta is replaced.
    if (!(publish || isFlowMissing(err))) {
      throw err
    }
    return
  })
  // New JSON on a live Flow takes it back to DRAFT, offline until published:
  // a draft save must never do that, nor replace it with a new Flow.
  if (!publish && current && LIVE_FLOW_STATUSES.has(current.status)) {
    return { flow: current, published: true, refusedLive: true }
  }
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
  return publish
    ? await publishDraft(auth, flowId)
    : await readDraft(auth, flowId)
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
    const publish = params.publish ?? true
    if (params.existingFlowId) {
      const updated = await tryUpdateExisting(
        auth,
        params.existingFlowId,
        params.flowJson,
        publish,
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
    return publish
      ? await publishDraft(auth, created.id)
      : await readDraft(auth, created.id)
  })
}

/**
 * Publishes a Flow already saved on Meta (e.g. a draft from
 * `publishFlowJson` with `publish: false`). A Flow that is not a draft is
 * returned as it is; a refused publish comes back on `publishError`.
 */
export function publishFlowDraft({
  auth,
  flowId,
}: {
  auth: WhatsappAuthValue
  flowId: string
}): Promise<PublishFlowJsonResult> {
  return rescue(async () => await publishDraft(auth, flowId))
}

export type FlowPreviewResult = {
  previewUrl: string | null
  /** When Meta stops serving `previewUrl`. */
  expiresAt: string | null
}

/**
 * Meta's web preview of a Flow (drafts included). The link is temporary:
 * fetch a new one rather than storing it.
 */
export function getFlowPreview({
  auth,
  flowId,
}: {
  auth: WhatsappAuthValue
  flowId: string
}): Promise<FlowPreviewResult> {
  return rescue(async () => {
    const { version = DEFAULT_API_VERSION } = auth
    const response = await ky
      .get<{ preview?: { preview_url?: string; expires_at?: string } }>(
        `${API_URL}/${version}/${flowId}`,
        {
          headers: buildAuthHeaders(auth),
          searchParams: { fields: "preview.invalidate(false)" },
        },
      )
      .json()
    return {
      previewUrl: response.preview?.preview_url ?? null,
      expiresAt: response.preview?.expires_at ?? null,
    }
  })
}

// Meta's Flow management error codes (Flows "Error Codes" reference).
/** "Can't deprecate unpublished flow" or "Flow is already deprecated". */
const CANNOT_DEPRECATE_CODE = 139_003
/** "Can't delete published Flow". */
const CANNOT_DELETE_CODE = 139_004
/** Graph's generic code; with "does not exist" it means the Flow is gone. */
const INVALID_PARAMETER_CODE = 100
const DOES_NOT_EXIST_REGEX = /does not exist/i

/** Statuses of a published Flow: Meta deprecates these, it never deletes them. */
const DEPRECATABLE_FLOW_STATUSES = LIVE_FLOW_STATUSES

export type DeleteFlowResult = {
  /**
   * `deleted` for a draft, `deprecated` for a published Flow (Meta cannot
   * delete those), `missing` when the Flow no longer exists on Meta, and
   * `skipped` when it is already deprecated or in a status Meta allows
   * neither call on.
   */
  outcome: "deleted" | "deprecated" | "missing" | "skipped"
  /** Meta's status afterwards; null once the Flow is gone. */
  status: string | null
}

const readMetaErrorCode = (err: unknown) => Number(parseOriginError(err).code)

const isFlowMissing = (err: unknown) => {
  const origin = parseOriginError(err)
  return (
    Number(origin.code) === INVALID_PARAMETER_CODE &&
    DOES_NOT_EXIST_REGEX.test(origin.message ?? "")
  )
}

const MISSING_FLOW: DeleteFlowResult = { outcome: "missing", status: null }

/** The Flow's current status, or null when it no longer exists. */
const readFlowStatus = async (
  auth: WhatsappAuthValue,
  flowId: string,
): Promise<string | null> => {
  try {
    return (await getFlow(auth, flowId)).status
  } catch (err) {
    if (isFlowMissing(err)) {
      return null
    }
    throw err
  }
}

const deleteDraftFlow = (auth: WhatsappAuthValue, flowId: string) => {
  const { version = DEFAULT_API_VERSION } = auth
  return ky
    .delete(`${API_URL}/${version}/${flowId}`, {
      headers: buildAuthHeaders(auth),
    })
    .json()
}

const deprecateFlow = (auth: WhatsappAuthValue, flowId: string) => {
  const { version = DEFAULT_API_VERSION } = auth
  return ky
    .post(`${API_URL}/${version}/${flowId}/deprecate`, {
      headers: buildAuthHeaders(auth),
    })
    .json()
}

/**
 * Deletes or deprecates a Flow read as `status`. The status can change
 * between the read and the call (Meta throttling a Flow, someone publishing
 * it in WhatsApp Manager), so Meta's refusal codes pick the other call —
 * once, so the two can never bounce off each other.
 */
const removeFlow = async (
  auth: WhatsappAuthValue,
  flowId: string,
  status: string | null,
  canRetry: boolean,
): Promise<DeleteFlowResult> => {
  if (status === null) {
    return MISSING_FLOW
  }
  if (status === "DRAFT") {
    try {
      await deleteDraftFlow(auth, flowId)
      return { outcome: "deleted", status: null }
    } catch (err) {
      if (isFlowMissing(err)) {
        return MISSING_FLOW
      }
      if (canRetry && readMetaErrorCode(err) === CANNOT_DELETE_CODE) {
        return await removeFlow(auth, flowId, "PUBLISHED", false)
      }
      throw err
    }
  }
  if (DEPRECATABLE_FLOW_STATUSES.has(status)) {
    try {
      await deprecateFlow(auth, flowId)
      return { outcome: "deprecated", status: "DEPRECATED" }
    } catch (err) {
      if (isFlowMissing(err)) {
        return MISSING_FLOW
      }
      if (canRetry && readMetaErrorCode(err) === CANNOT_DEPRECATE_CODE) {
        // Already deprecated, or turned back into a draft: re-read and act.
        const current = await readFlowStatus(auth, flowId)
        return await removeFlow(auth, flowId, current, false)
      }
      throw err
    }
  }
  return { outcome: "skipped", status }
}

/**
 * Removes a Flow from Meta as far as Meta allows: a draft is deleted, a
 * published (or throttled/blocked) Flow is deprecated so it can no longer be
 * sent. A Flow already gone reads as `missing`; token, permission and rate
 * limit errors throw.
 */
export function deleteFlow({
  auth,
  flowId,
}: {
  auth: WhatsappAuthValue
  flowId: string
}): Promise<DeleteFlowResult> {
  return rescue(async () => {
    const status = await readFlowStatus(auth, flowId)
    return await removeFlow(auth, flowId, status, true)
  })
}

export type DeleteFlowDraftResult = {
  /**
   * `deleted` for a draft, `missing` when the Flow no longer exists on Meta,
   * and `notDraft` when Meta reports any other status: the Flow is left as it
   * is, never deprecated.
   */
  outcome: "deleted" | "missing" | "notDraft"
  /** Meta's status afterwards; null once the Flow is gone. */
  status: string | null
}

const MISSING_DRAFT: DeleteFlowDraftResult = {
  outcome: "missing",
  status: null,
}

/**
 * Deletes a Flow only while Meta still has it as a draft. Unlike `deleteFlow`
 * it never deprecates: a Flow that went live (even between the status read
 * and the delete call) comes back as `notDraft`, untouched.
 */
export function deleteFlowDraft({
  auth,
  flowId,
}: {
  auth: WhatsappAuthValue
  flowId: string
}): Promise<DeleteFlowDraftResult> {
  return rescue(async () => {
    const status = await readFlowStatus(auth, flowId)
    if (status === null) {
      return MISSING_DRAFT
    }
    if (status !== "DRAFT") {
      return { outcome: "notDraft", status }
    }
    try {
      await deleteDraftFlow(auth, flowId)
      return { outcome: "deleted", status: null }
    } catch (err) {
      if (isFlowMissing(err)) {
        return MISSING_DRAFT
      }
      if (readMetaErrorCode(err) === CANNOT_DELETE_CODE) {
        const current = await readFlowStatus(auth, flowId)
        return current === null
          ? MISSING_DRAFT
          : { outcome: "notDraft", status: current }
      }
      throw err
    }
  })
}
