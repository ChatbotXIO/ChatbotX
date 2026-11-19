import { isContactSyncFollowUpChannel } from "@chatbotx.io/database/partials"
import { clientErrorHandler } from "@/lib/errors/client-handler"
import { client } from "@/lib/orpc/orpc"
import type { CoexistCallResult } from "./coexist-client"
import type { MessageKey } from "./message-key"
import type { ConnectPickerChannel } from "./registry"

/** The channel "import from AhaChat first" applies to: the ones with a history sync to follow (never WhatsApp). */
export const ahachatImportChannelOf = (channel: ConnectPickerChannel) =>
  isContactSyncFollowUpChannel(channel) ? channel : null

export type StartAhachatImportParams = {
  workspaceId: string
  /** The just-connected page's inbox. */
  inboxId: string
  aiReadsSyncedHistory: boolean
  t: (key: MessageKey) => string
}

/**
 * Starts the contacts-first import of one just-connected page: its contacts
 * from AhaChat, then its history sync by itself. A page AhaChat does not have
 * (or that cannot be imported right now) starts its plain history sync at once
 * instead, so the answer is "ok" whenever a history sync is going to run. The
 * failure text is translated here, so a row's sub-line and a toast say the same.
 */
export async function startAhachatImportCall({
  workspaceId,
  inboxId,
  aiReadsSyncedHistory,
  t,
}: StartAhachatImportParams): Promise<CoexistCallResult> {
  try {
    const result = await client.contactSyncAPIs.startContactImport({
      workspaceId,
      pages: [{ inboxId, aiReadsSyncedHistory }],
    })
    const page = result.pages[0]
    if (page && (page.outcome !== "fallback" || page.historyStarted)) {
      return { ok: true }
    }
    return {
      ok: false,
      text: t("ahachatImport.errors.historyNotStarted"),
      reported: false,
    }
  } catch (error) {
    await clientErrorHandler(error)
    return {
      ok: false,
      text: t("ahachatImport.errors.unknown"),
      reported: true,
    }
  }
}
