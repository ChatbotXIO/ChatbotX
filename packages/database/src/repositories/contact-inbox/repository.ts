import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import { contactInboxModel, integrationWhatsappModel } from "../../schema"

export type WhatsappCtwaInboxRow = {
  contactInboxId: string
  integrationWhatsappId: string
}

export type WhatsappCtwaInboxByContactRow = WhatsappCtwaInboxRow & {
  contactId: string
}

export const contactInboxRepository = {
  /**
   * Every WhatsApp contact-inbox for a contact that carries CTWA (click-to-
   * WhatsApp ad) attribution, paired with the WhatsApp integration that owns
   * it. Used by the `tagApplied` conversion-trigger hook points: a tag is
   * attached to a *contact*, not a specific conversation, so unlike
   * keywordMatched/contactReplied (which already have a contactInbox in
   * scope) this has to fan out to every ad-attributed inbox the contact has.
   */
  async listWhatsappCtwaInboxesByContact(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCtwaInboxRow[]> {
    const rows = await tx
      .select({
        contactInboxId: contactInboxModel.id,
        integrationWhatsappId: integrationWhatsappModel.id,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          eq(contactInboxModel.contactId, input.contactId),
          eq(contactInboxModel.channel, "whatsapp"),
          sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
        ),
      )

    return rows
  },

  /**
   * Batch sibling of `listWhatsappCtwaInboxesByContact` for many contacts at
   * once — one query instead of one-per-contact. Used by the bulk tag-attach
   * paths (tagService.bulkAttachToContacts/attachToContact, the builder bulk
   * contact-tag actions) so a chunk of N contacts costs a single round trip
   * instead of N.
   */
  async listWhatsappCtwaInboxesByContacts(
    input: { workspaceId: string; contactIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCtwaInboxByContactRow[]> {
    if (input.contactIds.length === 0) {
      return []
    }

    const rows = await tx
      .select({
        contactId: contactInboxModel.contactId,
        contactInboxId: contactInboxModel.id,
        integrationWhatsappId: integrationWhatsappModel.id,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          inArray(contactInboxModel.contactId, input.contactIds),
          eq(contactInboxModel.channel, "whatsapp"),
          sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
        ),
      )

    return rows
  },
}
