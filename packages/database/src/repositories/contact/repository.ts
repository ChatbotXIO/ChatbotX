import { type DatabaseClient, db } from "../../client"

/**
 * Contact-export keyset page (`apps/worker/src/default/handlers/export-
 * contacts.ts`). The `with` literal lives here so Drizzle keeps type
 * inference for the relational query; the handler keeps `chunkById` and its
 * own `fetchContactPage` wrapper around this call.
 */
export const contactRepository = {
  async listForExportPage(
    input: {
      where: Record<string, unknown>
      limit: number
      includeSourceUserId: boolean
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.contactModel.findMany({
      where: input.where,
      with: {
        contactCustomFields: true,
        tags: true,
        // The Contact Id column only needs the earliest row's sourceId. The
        // WhatsApp User ID column must scan every inbox connection for the
        // row that actually carries a sourceUserId, so the earliest-row
        // limit is lifted ONLY when that column is selected — ordinary
        // exports keep the single-row load.
        contactInboxes: {
          columns: { sourceId: true, sourceUserId: true },
          orderBy: { id: "asc" },
          ...(input.includeSourceUserId ? {} : { limit: 1 }),
        },
      },
      limit: input.limit,
      orderBy: { id: "asc" },
    })
  },
}

export type ContactExportPageRow = Awaited<
  ReturnType<typeof contactRepository.listForExportPage>
>[number]
