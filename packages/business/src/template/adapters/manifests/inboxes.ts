import { inboxRepository } from "@chatbotx.io/database/repositories"
import type { TemplateInboxManifestEntry } from "@chatbotx.io/flow-config"
import { ChatbotXException } from "../../../errors"
import type { TemplateInstallContext } from "../types"

export const templateInvalidInboxBindingException = (sourceInboxId: string) => {
  const exception = new ChatbotXException(
    "The chosen inbox does not match the template's inbox",
    "templateInvalidInboxBinding",
  )
  exception.data = { sourceInboxId }
  return exception
}

/**
 * Whether `target` can stand in for a manifest inbox: it belongs to the
 * install's workspace (the lookup is scoped to it), is connected, and is on the
 * same channel. Driven entirely by the manifest's `channelType` — no channel is
 * special-cased.
 */
export const isBindableInbox = (
  target: { channel: string; status: string },
  entry: TemplateInboxManifestEntry,
): boolean =>
  target.status === "connected" && target.channel === entry.channelType

/**
 * Maps each source inbox in the `inboxes` manifest to one of the target
 * workspace's inboxes (`idMaps.inbox`). An inbox is never created. Order:
 * 1. the installer's `inboxBindings` choice — an invalid one fails the install
 *    (`templateInvalidInboxBinding`), it is never quietly ignored;
 * 2. the source id itself, when it is a matching inbox of the target (an
 *    install into the workspace the template came from);
 * 3. unresolved — the adapter that needs the inbox warns and stays inactive.
 */
export const resolveInboxManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplateInboxManifestEntry>>,
): Promise<void> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return
  }
  const bindings = ctx.inboxBindings ?? {}
  const candidates = await inboxRepository.listIdentitiesByIds(
    {
      workspaceId: ctx.workspaceId,
      ids: entries.map(([sourceId]) => bindings[sourceId] ?? sourceId),
    },
    ctx.tx,
  )
  const byId = new Map(candidates.map((row) => [row.id, row]))

  const idMap = new Map<string, string>()
  for (const [sourceId, entry] of entries) {
    const bound = bindings[sourceId]
    const target = byId.get(bound ?? sourceId)
    if (target && isBindableInbox(target, entry)) {
      idMap.set(sourceId, target.id)
    } else if (bound) {
      throw templateInvalidInboxBindingException(sourceId)
    }
  }
  ctx.idMaps.inbox = idMap
}
