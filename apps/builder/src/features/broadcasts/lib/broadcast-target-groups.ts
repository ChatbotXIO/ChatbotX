/** What the flow tab needs to know about one template on one page. */
export type PageTemplateSummary = {
  id: string
  inboxId: string
  name: string
  language: string
  status: string
  /** `templateStructureKey` of the template (send-relevant structure). */
  structureKey: string
}

export type BroadcastPage = { inboxId: string; inboxName: string }
