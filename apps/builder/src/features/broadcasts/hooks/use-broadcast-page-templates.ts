import type { ChannelType } from "@chatbotx.io/database/partials"
import { templateStructureKey } from "@chatbotx.io/flow-config"
import { useMemo } from "react"
import type { FlowTemplateStore } from "@/features/flows/react-flow/stores/flow-template-store"
import { useFlowTemplate } from "@/features/flows/react-flow/stores/flow-template-store-provider"
import type { PageTemplateSummary } from "../lib/broadcast-target-groups"

type PageTemplateAdapter<TTemplate> = {
  list: (state: FlowTemplateStore) => readonly TTemplate[]
  toSummary: (template: TTemplate) => PageTemplateSummary
  refetch: (state: FlowTemplateStore) => () => Promise<void>
  isLoading: (state: FlowTemplateStore) => boolean
}

type WhatsappTemplate = FlowTemplateStore["whatsappTemplates"][number]
type MessengerTemplate = FlowTemplateStore["messengerTemplates"][number]

const whatsappAdapter: PageTemplateAdapter<WhatsappTemplate> = {
  list: (state) => state.whatsappTemplates,
  toSummary: (template) => ({
    id: template.id,
    inboxId: template.integrationWhatsapp.inboxId,
    name: template.name,
    language: template.language,
    status: template.status,
    structureKey: templateStructureKey(template),
    rejectionReason: null,
  }),
  refetch: (state) => state.fetchWhatsappTemplates,
  isLoading: (state) => state.loadingWhatsappTemplates,
}

const messengerAdapter: PageTemplateAdapter<MessengerTemplate> = {
  list: (state) => state.messengerTemplates,
  toSummary: (template) => ({
    id: template.id,
    inboxId: template.integrationMessenger.inboxId,
    name: template.name,
    language: template.language,
    status: template.status,
    structureKey: templateStructureKey(template),
    rejectionReason: template.rejectionReason,
  }),
  refetch: (state) => state.fetchMessengerTemplates,
  isLoading: (state) => state.loadingMessengerTemplates,
}

type AnyPageTemplate = WhatsappTemplate | MessengerTemplate

const EMPTY_LIST: readonly AnyPageTemplate[] = []
// A channel without templates: nothing is ever listed, so nothing is mapped.
const noTemplates: PageTemplateAdapter<AnyPageTemplate> = {
  list: () => EMPTY_LIST,
  toSummary: () => {
    throw new Error("This channel has no page templates")
  },
  refetch: () => () => Promise.resolve(),
  isLoading: () => false,
}

// One adapter per template-capable channel: how its store list maps to the
// page-agnostic summary the grouping works on. Adding a channel is one entry.
const pageTemplateAdapters: Partial<
  Record<ChannelType, PageTemplateAdapter<AnyPageTemplate>>
> = {
  whatsapp: whatsappAdapter as PageTemplateAdapter<AnyPageTemplate>,
  messenger: messengerAdapter as PageTemplateAdapter<AnyPageTemplate>,
}

/**
 * Every template of the workspace for `channel`, as page-scoped summaries with
 * their structure key, plus a way to refetch after a clone changed the pages.
 */
export function useBroadcastPageTemplates(channel: ChannelType): {
  templates: PageTemplateSummary[]
  templatesById: Map<string, PageTemplateSummary>
  isLoading: boolean
  refetch: () => Promise<void>
} {
  const adapter = pageTemplateAdapters[channel] ?? noTemplates
  const list = useFlowTemplate(adapter.list)
  const refetch = useFlowTemplate(adapter.refetch)
  const isLoading = useFlowTemplate(adapter.isLoading)

  const templates = useMemo(
    () => list.map((template) => adapter.toSummary(template)),
    [list, adapter],
  )
  const templatesById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )

  return { templates, templatesById, isLoading, refetch }
}
