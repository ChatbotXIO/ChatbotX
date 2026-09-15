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
 */
const CAPABILITIES_LIST_LIMIT = 200

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

async function listTemplates(
  workspaceId: string,
): Promise<CapabilitiesTemplate[]> {
  const templates = await whatsappMessageTemplateService.list({
    where: { workspaceId },
  })
  // follow-up: tagService.listActive / whatsappMessageTemplateService.list have no limit param; capabilities slices in memory.
  return templates.slice(0, CAPABILITIES_LIST_LIMIT).map((template) => ({
    id: template.id,
    name: template.name,
    language: template.language,
    status: template.status,
    params: extractTemplateParams(template.components as TemplateComponent[]),
  }))
}

async function listCustomFields(
  workspaceId: string,
): Promise<CapabilitiesField[]> {
  const { data } = await customFieldService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
  })
  return data.map(toCapabilitiesField)
}

async function listBotFields(
  workspaceId: string,
): Promise<CapabilitiesField[]> {
  const { data } = await botFieldService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
  })
  return data.map(toCapabilitiesField)
}

async function listTags(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const tags = await tagService.listActive({ workspaceId })
  // follow-up: tagService.listActive / whatsappMessageTemplateService.list have no limit param; capabilities slices in memory.
  return tags.slice(0, CAPABILITIES_LIST_LIMIT)
}

async function listAiAgents(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const { data } = await aiAgentService.listAIAgents({
    workspaceId,
    page: 1,
    perPage: CAPABILITIES_LIST_LIMIT,
    sort: [],
  })
  return data.map((agent) => ({ id: agent.id, name: agent.name }))
}

async function listSequences(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const { data } = await sequenceService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
  })
  return data.map((sequence) => ({ id: sequence.id, name: sequence.name }))
}

async function listFlows(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const { data } = await flowService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
  })
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

  const entries = await Promise.all(
    includes.map(
      async (include) =>
        [include, await CAPABILITY_LOADERS[include](workspaceId)] as const,
    ),
  )

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
  // `unknownTemplate` errors.
  const [templates, customFields, flows] = await Promise.all([
    listTemplates(workspaceId),
    listCustomFields(workspaceId),
    listFlows(workspaceId),
  ])

  return {
    templatesByName: new Map(
      templates.map((template) => [
        template.name,
        {
          id: template.id,
          language: template.language,
          status: template.status,
        },
      ]),
    ),
    customFieldsByName: new Map(
      customFields.map((field) => [
        field.name,
        { id: field.id, type: field.type },
      ]),
    ),
    flowsByName: new Map(flows.map((flow) => [flow.name, { id: flow.id }])),
  }
}
