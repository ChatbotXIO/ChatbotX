import { type DatabaseClient, db } from "@chatbotx.io/database/client"

class ContactCustomFieldValueService {
  async findValue(input: {
    tx?: DatabaseClient
    contactId: string
    customFieldId: string
  }): Promise<string | null> {
    const { tx = db, contactId, customFieldId } = input
    const row = await tx.query.contactCustomFieldModel.findFirst({
      where: {
        contactId,
        customFieldId,
      },
      columns: { value: true },
    })

    return row?.value ?? null
  }
}

export const contactCustomFieldValueService =
  new ContactCustomFieldValueService()
