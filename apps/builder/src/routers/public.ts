import publicBotFieldsAPI from "@/features/account-fields/api/public"
import contactsPublicAPIs from "@/features/contacts/api/public"
import customFieldsPublicAPI from "@/features/custom-fields/api/public"
import publicFlowsAPI from "@/features/flows/api/public"
import tagsPublicAPI from "@/features/tags/api/public"

export const publicRouter = {
  ...contactsPublicAPIs,
  ...customFieldsPublicAPI,
  ...tagsPublicAPI,
  ...publicFlowsAPI,
  ...publicBotFieldsAPI,
}
