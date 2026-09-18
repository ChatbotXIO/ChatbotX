import type { BroadcastTemplateDetail } from "@chatbotx.io/business"
import type { BroadcastResourceWithRelations } from "../schema/resource"

/** The page a legacy single-page broadcast sends from, else a dash. */
export function resolveLegacyPageName(
  broadcast: BroadcastResourceWithRelations,
): string {
  return (
    broadcast.integrationWhatsapp?.name ??
    broadcast.integrationMessenger?.name ??
    "-"
  )
}

/**
 * The page(s) a broadcast sends from: every target page of a multi-page
 * broadcast, else the legacy integration's page, else a dash.
 */
export function resolveBroadcastPageNames(
  broadcast: BroadcastResourceWithRelations,
): string {
  const targetPageNames = (broadcast.targets ?? []).map(
    (target) => target.inbox.name,
  )
  if (targetPageNames.length > 0) {
    return targetPageNames.join(", ")
  }
  return resolveLegacyPageName(broadcast)
}

export type BroadcastPageFlow = {
  pageId: string
  pageName: string
  flowId: string
  flowName: string
}

/**
 * The flow each page runs: one row per target page in targets mode, else the
 * legacy broadcast-level flow. A flow whose row is gone keeps its id as name.
 */
export function resolveBroadcastPageFlows(
  broadcast: BroadcastResourceWithRelations,
): BroadcastPageFlow[] {
  const targetFlows = (broadcast.targets ?? []).flatMap((target) =>
    target.flowId
      ? [
          {
            pageId: target.inboxId,
            pageName: target.inbox.name,
            flowId: target.flowId,
            flowName: target.flow?.name ?? target.flowId,
          },
        ]
      : [],
  )
  if (targetFlows.length > 0 || !broadcast.flowId) {
    return targetFlows
  }
  return [
    {
      pageId: broadcast.id,
      pageName: resolveLegacyPageName(broadcast),
      flowId: broadcast.flowId,
      flowName: broadcast.flow?.name ?? broadcast.flowId,
    },
  ]
}

export type BroadcastTemplatePage = {
  /** Absent on a legacy single-page broadcast, which keeps no target rows. */
  pageId?: string
  pageName: string
  templateId: string
}

/**
 * The template each page sends: one row per target page in targets mode,
 * else the legacy broadcast-level template. Rows come from the broadcast
 * itself, so a page whose template was since deleted is still listed.
 */
export function resolveBroadcastTemplatePages(
  broadcast: BroadcastResourceWithRelations,
): BroadcastTemplatePage[] {
  const targetTemplates = (broadcast.targets ?? []).flatMap((target) =>
    target.templateId
      ? [
          {
            pageId: target.inboxId,
            pageName: target.inbox.name,
            templateId: target.templateId,
          },
        ]
      : [],
  )
  if (targetTemplates.length > 0 || !broadcast.templateId) {
    return targetTemplates
  }
  return [
    {
      pageName: resolveLegacyPageName(broadcast),
      templateId: broadcast.templateId,
    },
  ]
}

/**
 * The loaded template of one page, matched the way the server pairs them: a
 * page-pinned row only matches that page's template. Undefined when the
 * template no longer exists.
 */
export function findPageTemplateDetail(
  page: BroadcastTemplatePage,
  details: BroadcastTemplateDetail[],
): BroadcastTemplateDetail | undefined {
  return details.find(
    (detail) =>
      detail.id === page.templateId &&
      (!page.pageId || detail.inboxId === page.pageId),
  )
}
