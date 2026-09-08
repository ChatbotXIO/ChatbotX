import { contactsFilterFieldsPublicRouter } from "@/features/contact-filter/api/public"
import { contactsInboxesPublicRouter } from "@/features/contact-inboxes/api/public"
import { contactsNotesPublicRouter } from "@/features/contact-notes/api/public"
import { contactsSequencesPublicRouter } from "@/features/contact-sequences/api/public"
import { contactsBulkPublicRouter } from "./public/bulk"
import { contactsCrudPublicRouter } from "./public/crud"
import { contactsCustomFieldsPublicRouter } from "./public/custom-fields"
import { contactsExportPublicRouter } from "./public/export"
import { contactsMessagesPublicRouter } from "./public/messages"
import { contactsRefreshProfilePublicRouter } from "./public/refresh-profile"
import { contactsTagsPublicRouter } from "./public/tags"

export const contactsPublicRouter = {
  ...contactsCrudPublicRouter,
  ...contactsTagsPublicRouter,
  ...contactsCustomFieldsPublicRouter,
  ...contactsMessagesPublicRouter,
  ...contactsNotesPublicRouter,
  ...contactsSequencesPublicRouter,
  ...contactsInboxesPublicRouter,
  ...contactsFilterFieldsPublicRouter,
  ...contactsBulkPublicRouter,
  ...contactsExportPublicRouter,
  ...contactsRefreshProfilePublicRouter,
}
