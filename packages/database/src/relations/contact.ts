import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactRelations = defineRelationsPart(schema, (r) => ({
  contactModel: {
    tags: r.many.tagModel({
      from: r.contactModel.id.through(r.contactsToTagsModel.contactId),
      to: r.tagModel.id.through(r.contactsToTagsModel.tagId),
    }),
    workspace: r.one.workspaceModel({
      from: r.contactModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    customFields: r.many.customFieldModel({
      from: r.contactModel.id.through(r.contactCustomFieldModel.contactId),
      to: r.customFieldModel.id.through(
        r.contactCustomFieldModel.customFieldId,
      ),
    }),
    users: r.many.userModel({
      from: r.contactModel.id.through(r.contactNoteModel.contactId),
      to: r.userModel.id.through(r.contactNoteModel.createdById),
    }),
    broadcasts: r.many.broadcastModel({
      from: r.contactModel.id.through(r.contactsOnBroadcastsModel.contactId),
      to: r.broadcastModel.id.through(r.contactsOnBroadcastsModel.broadcastId),
    }),
    conversation: r.one.conversationModel({
      from: r.contactModel.id,
      to: r.conversationModel.contactId,
    }),
    errorLogs: r.many.errorLogModel({
      from: r.contactModel.id,
      to: r.errorLogModel.contactId,
    }),
    contactCustomFields: r.many.contactCustomFieldModel({
      from: r.contactModel.id,
      to: r.contactCustomFieldModel.contactId,
    }),
    contactNotes: r.many.contactNoteModel({
      from: r.contactModel.id,
      to: r.contactNoteModel.contactId,
    }),
    contactsOnSequences: r.many.contactsOnSequenceModel({
      from: r.contactModel.id,
      to: r.contactsOnSequenceModel.contactId,
    }),
    sequences: r.many.sequenceModel({
      from: r.contactModel.id.through(r.contactsOnSequenceModel.contactId),
      to: r.sequenceModel.id.through(r.contactsOnSequenceModel.sequenceId),
    }),
    contactInboxes: r.many.contactInboxModel({
      from: r.contactModel.id,
      to: r.contactInboxModel.contactId,
    }),
  },
}))
