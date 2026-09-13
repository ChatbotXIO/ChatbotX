import type {
  FlowAuthoringContext,
  TemplateComponent,
  WaTemplateParams,
} from "@chatbotx.io/flow-config"
import {
  extractTemplateParams,
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

/**
 * Caps every list this service gathers. This output is fed straight into an
 * LLM's context window (P2.1's design constraint, not a DB/perf one) — a
 * workspace with thousands of tags or custom fields must never blow up the
 * response; an agent that needs more than this can page through the
 * resource's own list endpoint (`tags.list`, `customFields.list`, ...).
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

// The default set returned when `include` is omitted — the flow-authoring
// essentials (P1.2's `FlowAuthoringContext` resolves against exactly these
// names). `aiAgents` is left out of the default: it's rarely needed to build
// a flow and the same information is one `ai_agents_list` call away.
const DEFAULT_INCLUDES: readonly CapabilitiesInclude[] = [
  "inboxes",
  "templates",
  "customFields",
  "botFields",
  "tags",
  "sequences",
  "flows",
  "flowSpec",
]

export type CapabilitiesInbox = { id: string; name: string; channel: string }
export type CapabilitiesTemplate = {
  id: string
  name: string
  language: string
  status: string
  params: WaTemplateParams
}
export type CapabilitiesField = { id: string; name: string; type: string }
export type CapabilitiesNamedEntity = { id: string; name: string }
export type CapabilitiesFlowSpecStepType = { type: string; description: string }
export type CapabilitiesFlowSpec = {
  stepTypes: CapabilitiesFlowSpecStepType[]
  waitUnits: string[]
  channels: string[]
}

export type CapabilitiesResponse = {
  inboxes?: CapabilitiesInbox[]
  templates?: CapabilitiesTemplate[]
  customFields?: CapabilitiesField[]
  botFields?: CapabilitiesField[]
  tags?: CapabilitiesNamedEntity[]
  aiAgents?: CapabilitiesNamedEntity[]
  sequences?: CapabilitiesNamedEntity[]
  flows?: CapabilitiesNamedEntity[]
  flowSpec?: CapabilitiesFlowSpec
}

// Mirrors the `.describe()` text on each `flowStepSpecSchema` member in
// `@chatbotx.io/flow-config`'s `authoring/spec-schema.ts` — kept as a short,
// hand-written summary here rather than derived from the zod schema, since
// this list is meant to be skimmed inline in `capabilities.get`'s response,
// while `GET /v1/schemas/flow-spec` (P2.2) is the full, authoritative JSON
// Schema for actually authoring a step.
const FLOW_SPEC_STEP_TYPES: CapabilitiesFlowSpecStepType[] = [
  {
    type: "send",
    description:
      "Send one text/image/file message, optionally with up to 3 quick-reply buttons.",
  },
  {
    type: "sendTemplate",
    description: "Send an existing WhatsApp message template by name.",
  },
  { type: "wait", description: "Pause the flow for a fixed duration." },
  {
    type: "branch",
    description:
      "Split the flow by contact-filter-style conditions (see contacts.listFilterFields).",
  },
  {
    type: "action",
    description:
      "Perform a workspace action: addTags, removeTags, setCustomField, assignConversation, or archiveConversation.",
  },
  {
    type: "startFlow",
    description: "Start another flow for the contact, by name.",
  },
  {
    type: "addNote",
    description: "Add an internal note to the conversation.",
  },
  {
    type: "goto",
    description:
      "Jump to an already-defined step (by its `id`) instead of continuing linearly. Must be the last step in its list.",
  },
]

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
  return data.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.type,
  }))
}

async function listBotFields(
  workspaceId: string,
): Promise<CapabilitiesField[]> {
  const { data } = await botFieldService.list({
    workspaceId,
    perPage: CAPABILITIES_LIST_LIMIT,
  })
  return data.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.type,
  }))
}

async function listTags(
  workspaceId: string,
): Promise<CapabilitiesNamedEntity[]> {
  const tags = await tagService.listActive({ workspaceId })
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
  return {
    stepTypes: FLOW_SPEC_STEP_TYPES,
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
 * Workspace capability discovery for MCP agents (P2.1) — the same shape of
 * problem `listContactFilterFieldsForAPI` already solves for contact
 * filters: gather every named workspace entity an agent needs to reference
 * by id, in parallel, compact. Reused directly by both `GET /v1/capabilities`
 * (P2.2) and the flow-spec compiler's `FlowAuthoringContext` (P1.2/P1.3) —
 * the latter via `getFlowAuthoringContext` below, so the two never drift on
 * what a "known template/flow/tag/custom field" is.
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
  const [inboxes, templates, tags, customFields, flows] = await Promise.all([
    listInboxes(workspaceId),
    listTemplates(workspaceId),
    listTags(workspaceId),
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
    inboxesByName: new Map(
      inboxes.map((inbox) => [
        inbox.name,
        { id: inbox.id, channel: inbox.channel },
      ]),
    ),
    tagsByName: new Map(tags.map((tag) => [tag.name, { id: tag.id }])),
    customFieldsByName: new Map(
      customFields.map((field) => [
        field.name,
        { id: field.id, type: field.type },
      ]),
    ),
    flowsByName: new Map(flows.map((flow) => [flow.name, { id: flow.id }])),
  }
}
