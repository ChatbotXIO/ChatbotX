import { type DatabaseClient, db, sql } from "../../client"

export const contactRepository = {
  /**
   * Fill `Contact.phoneNumber` / `Contact.email` only when currently NULL —
   * moved VERBATIM from `bulk-historical-import.ts`'s contact-enrichment
   * transaction. The double-`::text` cast and the compound `WHERE` guard are
   * load-bearing; do not simplify.
   */
  async enrichIfNull(
    props: {
      contactId: string
      phoneNumber?: string
      email?: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const { contactId, phoneNumber, email } = props
    await tx.transaction(async (innerTx) => {
      await innerTx.execute(sql`
        UPDATE "Contact" SET
          "phoneNumber" = COALESCE("phoneNumber", ${phoneNumber ?? null}::text),
          "email"       = COALESCE("email",       ${email ?? null}::text)
        WHERE "id" = ${contactId}
          AND (
            (${phoneNumber ?? null}::text IS NOT NULL AND "phoneNumber" IS NULL)
            OR (${email ?? null}::text IS NOT NULL AND "email" IS NULL)
          )
      `)
    })
  },
}
