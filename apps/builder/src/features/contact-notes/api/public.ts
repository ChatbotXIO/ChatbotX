import { contactNoteService, contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  addContactNotePublicRequest,
  listContactNotesPublicResponse,
  updateContactNotePublicRequest,
} from "@/features/contact-notes/schema/public"
import { contactNoteResource } from "@/features/contact-notes/schema/resource"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsNotesPublicRouter = {
  listNotes: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/notes",
      summary: "List notes on contact",
      description:
        "Returns every internal note on the contact identified by `identifier`. Use `contacts.createNote` to add one.",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier: the numeric contact id, an email address, or a phone number.",
          ),
      }),
    )
    .output(listContactNotesPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const data = await contactNoteService.listByContactId({
        workspaceId,
        contactId,
      })
      return { data }
    }),

  createNote: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/notes",
      summary: "Add note to contact",
      description:
        "Adds an internal note to the contact identified by `identifier`, visible only to workspace users. Use `contacts.listNotes` to see existing notes.",
      tags: ["Contacts"],
    })
    .input(
      addContactNotePublicRequest.and(
        z.object({
          identifier: z
            .string()
            .min(1)
            .describe(
              "Contact identifier: the numeric contact id, an email address, or a phone number.",
            ),
        }),
      ),
    )
    .output(contactNoteResource)
    // Mutating, not creating: the note is new, but `{identifier}` is resolved
    // via `contactService.resolveIdByIdentifier`, which throws a 404 when the
    // contact does not exist — so this route must declare `notFound` too.
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Update note on contact",
      description:
        "Overwrites the text of one note on the contact identified by `identifier`. Use `contacts.listNotes` to find its `noteId` first.",
      tags: ["Contacts"],
    })
    .input(
      updateContactNotePublicRequest.and(
        z.object({
          identifier: z
            .string()
            .min(1)
            .describe(
              "Contact identifier: the numeric contact id, an email address, or a phone number.",
            ),
          noteId: zodBigintAsString().describe("Note id (numeric string)."),
        }),
      ),
    )
    .output(contactNoteResource)
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Delete note from contact",
      description:
        "Permanently removes one note from the contact identified by `identifier`.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier: the numeric contact id, an email address, or a phone number.",
          ),
        noteId: zodBigintAsString().describe("Note id (numeric string)."),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
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
