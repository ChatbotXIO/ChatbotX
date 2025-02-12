"use server"

import { CustomFieldType, FieldType } from "@ahachat.ai/database"
import { getFields } from "../queries"

export async function fetchCustomFields(chatbotId: string) {
  const { data } = await getFields({
    chatbotId,
    folderId: undefined,
    perPage: 500,
    fieldType: FieldType.CustomField,
    customFieldType: CustomFieldType.DateTime,
    name: "",
    sort: [{ id: "createdAt", desc: true }],
    page: 1,
  })

  return data
}
