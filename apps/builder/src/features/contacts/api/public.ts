import { contactsFilterFieldsPublicRouter } from "@/features/contact-filter/api/public"
import { contactsInboxesPublicRouter } from "@/features/contact-inboxes/api/public"
import { contactsNotesPublicRouter } from "@/features/contact-notes/api/public"
import { contactsSequencesPublicRouter } from "@/features/contact-sequences/api/public"
import { importPublicRouter } from "@/features/import/api/public"
import { contactsAdReferralsPublicRouter } from "./public/ad-referrals"
import { contactsBroadcastsPublicRouter } from "./public/broadcasts"
import { contactsBulkPublicRouter } from "./public/bulk"
import { contactsCrudPublicRouter } from "./public/crud"
import { contactsCustomFieldsPublicRouter } from "./public/custom-fields"
import { contactsExportPublicRouter } from "./public/export"
import { contactsMessagesPublicRouter } from "./public/messages"
import { contactsRefreshProfilePublicRouter } from "./public/refresh-profile"
import { contactsTagsPublicRouter } from "./public/tags"
import { contactsTouchpointsPublicRouter } from "./public/touchpoints"

export const contactsPublicRouter = {
  ...contactsCrudPublicRouter,
  ...contactsTagsPublicRouter,
  ...contactsAdReferralsPublicRouter,
  ...contactsTouchpointsPublicRouter,
  ...contactsBroadcastsPublicRouter,
  ...contactsCustomFieldsPublicRouter,
  ...contactsMessagesPublicRouter,
  ...contactsNotesPublicRouter,
  ...contactsSequencesPublicRouter,
  ...contactsInboxesPublicRouter,
  ...importPublicRouter,
  ...contactsFilterFieldsPublicRouter,
  ...contactsBulkPublicRouter,
  ...contactsExportPublicRouter,
  ...contactsRefreshProfilePublicRouter,
}
