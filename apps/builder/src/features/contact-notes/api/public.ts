import { contactNoteService, contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  addContactNotePublicRequest,
  listContactNotesPublicResponse,
  updateContactNotePublicRequest,
} from "@/features/contact-notes/schema/public"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsNotesPublicRouter = {
  listNotes: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/notes",
      summary: "List notes on the contact",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(listContactNotesPublicResponse)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const data = await contactNoteService.listByContactId({ contactId })
      return { data }
    }),

  createNote: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/notes",
      summary: "Add a note to the contact",
      tags: ["Contacts"],
    })
    .input(
      addContactNotePublicRequest.and(
        z.object({ identifier: z.string().min(1) }),
      ),
    )
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      return await contactNoteService.create({
        workspaceId,
        contactId,
        createdById: null,
        text: input.text,
      })
    }),

  updateNote: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}/notes/{noteId}",
      summary: "Update a note on the contact",
      tags: ["Contacts"],
    })
    .input(
      updateContactNotePublicRequest.and(
        z.object({
          identifier: z.string().min(1),
          noteId: zodBigintAsString(),
        }),
      ),
    )
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      return await contactNoteService.update({
        workspaceId,
        contactId,
        noteId: input.noteId,
        text: input.text,
      })
    }),

  deleteNote: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/notes/{noteId}",
      summary: "Delete a note from the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        noteId: zodBigintAsString(),
      }),
    )
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      await contactNoteService.delete({
        workspaceId,
        contactId,
        noteId: input.noteId,
      })
    }),
}
