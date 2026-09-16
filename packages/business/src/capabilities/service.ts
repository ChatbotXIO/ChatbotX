import type {
  FlowAuthoringContext,
  FlowSpecStepType,
  TemplateComponent,
} from "@chatbotx.io/flow-config"
import {
  extractTemplateParams,
  flowSpecStepTypes,
  waitStepDelayUnits,
} from "@chatbotx.io/flow-config"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { aiAgentService } from "../ai-agent/service"
import { botFieldService } from "../bot-field/service"
import { customFieldService } from "../custom-field/service"
import { flowService } from "../flow/service"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { sequenceService } from "../sequence/service"
import { tagService } from "../tag/service"
import { whatsappMessageTemplateService } from "../whatsapp-message-template/service"
import type {
  CapabilitiesField,
  CapabilitiesFlowSpec,
  CapabilitiesInbox,
  CapabilitiesNamedEntity,
  CapabilitiesResponse,
  CapabilitiesTemplate,
} from "./schema"

export type {
  CapabilitiesField,
  CapabilitiesFlowSpec,
  CapabilitiesFlowSpecStepType,
  CapabilitiesInbox,
  CapabilitiesNamedEntity,
  CapabilitiesResponse,
  CapabilitiesTemplate,
} from "./schema"

/**
 * Caps every list this service gathers. This output is fed straight into an
 * LLM's context window — a workspace with thousands of tags or custom
 * fields must never blow up the response; an agent that needs more than
 * this can page through the resource's own list endpoint (`tags.list`,
 * `customFields.list`, ...).
 *
 * Only bounds the public `getCapabilities` response — `getFlowAuthoringContext`
 * below fetches every template/custom field/flow unbounded, since the
 * compiler must resolve DSL names against the *entire* workspace, not a
 * truncated page of it.
 */
const CAPABILITIES_LIST_LIMIT = 200

/** Stable order for every list capped at `CAPABILITIES_LIST_LIMIT` — without
 * it, which N rows of a larger table you get back is nondeterministic
 * per-query, so the same "50th+" row can appear or vanish across calls. */
const STABLE_ID_SORT = [{ id: "id", desc: false }]

// Mirrors the same-named constant in
// packages/flow-config/src/authoring/compile.ts — only an APPROVED template
// compiles into a `sendTemplate` step, so preferring it here keeps
// `getFlowAuthoringContext` picking the variant the compiler would actually
// accept when a name collides across languages.
const APPROVED_TEMPLATE_STATUS = "APPROVED"

export const CAPABILITIES_INCLUDES = [
  "inboxes",
  "templates",
  "customFields",
  "botFields",
  "tags",
  "aiAgents",
  "sequences",
  "flows",
  "flowSpec",
] as const
export type CapabilitiesInclude = (typeof CAPABILITIES_INCLUDES)[number]

// The default set returned when `include` is omitted — flow-authoring
// essentials (`FlowAuthoringContext` resolves against the `templates`,
// `customFields`, and `flows` names in here) plus the read-only reference
// lists (`inboxes`, `botFields`, `tags`, `sequences`) an agent typically
// needs alongside them. `aiAgents` is left out of the default: it's rarely
// needed to build a flow and the same information is one `ai_agents_list`
// call away.
export const OPT_IN_INCLUDES: readonly CapabilitiesInclude[] = ["aiAgents"]
export const DEFAULT_INCLUDES = CAPABILITIES_INCLUDES.filter(
  (include) => !OPT_IN_INCLUDES.includes(include),
)

function toCapabilitiesField(field: {
  id: string
  name: string
  type: string
}): CapabilitiesField {
  return { id: field.id, name: field.name, type: field.type }
}

// inboxService.list has no `sort` param (it doesn't apply an `orderBy` at
// all) — unlike the other truncating loaders below, its result order is
// whatever the DB returns for an unordered query, so it cannot be made
// deterministic here without a change to InboxService itself.
async function listInboxes(workspaceId: string): Promise<CapabilitiesInbox[]> {
  const { data } = await inboxService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
  })
  return data.map((inbox) => ({
    id: inbox.id,
    name: inbox.name,
    channel: inbox.channel,
  }))
}

function toCapabilitiesTemplate(template: {
  id: string
  name: string
  language: string
  status: string
  components: unknown
}): CapabilitiesTemplate {
  const components = Array.isArray(template.components)
    ? (template.components as TemplateComponent[])
    : []
  return {
    id: template.id,
    name: template.name,
    language: template.language,
    status: template.status,
    params: extractTemplateParams(components),
  }
}

/** Public, capped path — see the `CAPABILITIES_LIST_LIMIT` note above. */
async function listTemplates(
  workspaceId: string,
): Promise<CapabilitiesTemplate[]> {
  const templates = await whatsappMessageTemplateService.list({
    where: { workspaceId },
  })
  // follow-up: whatsappMessageTemplateService.list has no limit param; capabilities slices in memory.
  return templates.slice(0, CAPABILITIES_LIST_LIMIT).map(toCapabilitiesTemplate)
}

/** Unbounded — see `getFlowAuthoringContext`. */
async function listAllTemplates(
  workspaceId: string,
): Promise<CapabilitiesTemplate[]> {
  const templates = await whatsappMessageTemplateService.list({
    where: { workspaceId },
  })
  return templates.map(toCapabilitiesTemplate)
}

/** Public, capped path — see the `CAPABILITIES_LIST_LIMIT` note above. */
async function listCustomFields(
  workspaceId: string,
): Promise<CapabilitiesField[]> {
  const { data } = await customFieldService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
    sort: STABLE_ID_SORT,
  })
  return data.map(toCapabilitiesField)
}

/** Unbounded — see `getFlowAuthoringContext`. */
async function listAllCustomFields(
  workspaceId: string,
): Promise<CapabilitiesField[]> {
  const { data } = await customFieldService.list({ workspaceId })
  return data.map(toCapabilitiesField)
}

async function listBotFields(
  workspaceId: string,
): Promise<CapabilitiesField[]> {
  const { data } = await botFieldService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
    sort: STABLE_ID_SORT,
  })
  return data.map(toCapabilitiesField)
}

async function listTags(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const tags = await tagService.listActive({ workspaceId })
  // follow-up: tagService.listActive has no limit param; capabilities slices in memory.
  return tags.slice(0, CAPABILITIES_LIST_LIMIT)
}

async function listAiAgents(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const { data } = await aiAgentService.listAIAgents({
    workspaceId,
    page: 1,
    perPage: CAPABILITIES_LIST_LIMIT,
    sort: STABLE_ID_SORT,
  })
  return data.map((agent) => ({ id: agent.id, name: agent.name }))
}

async function listSequences(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const { data } = await sequenceService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
    sort: STABLE_ID_SORT,
  })
  return data.map((sequence) => ({ id: sequence.id, name: sequence.name }))
}

/** Public, capped path — see the `CAPABILITIES_LIST_LIMIT` note above. */
async function listFlows(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const { data } = await flowService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
    sort: STABLE_ID_SORT,
  })
  return data.map((flow) => ({ id: flow.id, name: flow.name }))
}

/** Unbounded — see `getFlowAuthoringContext`. */
async function listAllFlows(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const { data } = await flowService.list({ workspaceId })
  return data.map((flow) => ({ id: flow.id, name: flow.name }))
}

function getFlowSpecCapabilities(): CapabilitiesFlowSpec {
  const stepTypes: FlowSpecStepType[] = flowSpecStepTypes

  return {
    stepTypes,
    waitUnits: [...waitStepDelayUnits.options],
    channels: [...channelTypes.options],
  }
}

const CAPABILITY_LOADERS: {
  [K in CapabilitiesInclude]: (
    workspaceId: string,
  ) => Promise<CapabilitiesResponse[K]>
} = {
  inboxes: listInboxes,
  templates: listTemplates,
  customFields: listCustomFields,
  botFields: listBotFields,
  tags: listTags,
  aiAgents: listAiAgents,
  sequences: listSequences,
  flows: listFlows,
  flowSpec: (_workspaceId: string) =>
    Promise.resolve(getFlowSpecCapabilities()),
}

/**
 * Workspace capability discovery for MCP agents — the same shape of problem
 * `listContactFilterFieldsForAPI` already solves for contact filters:
 * gather every named workspace entity an agent needs to reference by id, in
 * parallel, compact. Reused directly by both `GET /v1/capabilities` and the
 * flow-spec compiler's `FlowAuthoringContext` — the latter via
 * `getFlowAuthoringContext` below, so the two never drift on what a "known
 * template/flow/custom field" is.
 */
export async function getCapabilities(props: {
  workspaceId: string
  include?: readonly CapabilitiesInclude[]
}): Promise<CapabilitiesResponse> {
  const { workspaceId } = props
  const includes = props.include ?? DEFAULT_INCLUDES

  // `allSettled`, not `all`: this response is an explicitly partial,
  // `include`-filtered bag — one loader failing (e.g. a malformed row) must
  // not 500 the whole call when the caller only cares about the others.
  const settled = await Promise.allSettled(
    includes.map(
      async (include) =>
        [include, await CAPABILITY_LOADERS[include](workspaceId)] as const,
    ),
  )

  const entries = settled.flatMap((result) => {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason, workspaceId },
        "capabilities.get: one loader failed; omitting it from the response",
      )
      return []
    }
    return [result.value]
  })

  return Object.fromEntries(entries) as CapabilitiesResponse
}

/**
 * The exact reference maps `compileFlowSpec` (`@chatbotx.io/flow-config`)
 * needs to resolve DSL names — fetched directly (independent of the public
 * `include` filter above) since a flow-spec compile always needs every one
 * of these, regardless of what a `capabilities.get` caller asked to see.
 */
export async function getFlowAuthoringContext(
  workspaceId: string,
): Promise<FlowAuthoringContext> {
  // Deliberately uncached: an agent can create a template then immediately
  // reference it in the same session, and a cache TTL would cause false
  // `unknownTemplate` errors. Unbounded loaders (not `listTemplates` /
  // `listCustomFields` / `listFlows`, which cap at `CAPABILITIES_LIST_LIMIT`
  // for the public response) — the compiler must resolve DSL names against
  // the entire workspace, not a truncated page.
  const [templates, customFields, flows] = await Promise.all([
    listAllTemplates(workspaceId),
    listAllCustomFields(workspaceId),
    listAllFlows(workspaceId),
  ])

  return {
    // WhatsApp templates are unique per name + language, but the DSL's
    // `sendTemplate.templateName` has no language field to disambiguate —
    // so when two language variants share a name, prefer the APPROVED one
    // (the only one the compiler would accept anyway) over last-wins array
    // order, which is arbitrary and can silently pick an unusable variant.
    templatesByName: templates.reduce((map, template) => {
      const existing = map.get(template.name)
      if (!existing || existing.status !== APPROVED_TEMPLATE_STATUS) {
        map.set(template.name, {
          id: template.id,
          language: template.language,
          status: template.status,
        })
      }
      return map
    }, new Map<string, { id: string; language: string; status: string }>()),
    customFieldsByName: new Map(
      customFields.map((field) => [
        field.name,
        { id: field.id, type: field.type },
      ]),
    ),
    flowsByName: new Map(flows.map((flow) => [flow.name, { id: flow.id }])),
  }
}
