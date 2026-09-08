import { contactService, tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicTagResource } from "@/features/tags/schema/resource"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listContactTags } from "../../queries/list-contact-tags.query"
import {
  addTagsByNamePublicRequest,
  setAllContactTagsPublicRequest,
} from "../../schema/public/tags"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsTagsPublicRouter = {
  listTags: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/tags",
      summary: "Get all tags added to this contact",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(z.object({ data: z.array(publicTagResource) }))
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await listContactTags({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),

  addTags: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/tags",
      summary: "Add tags to the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        tagIds: z.array(zodBigintAsString()).min(1).max(100),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await tagService.attachToContact({
        workspaceId: context.workspace.id,
        contactId,
        tagIds: input.tagIds,
      })
    }),

  removeTags: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/tags",
      summary: "Remove tags from the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        tagIds: z.array(zodBigintAsString()).min(1).max(100),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await tagService.detachFromContact({
        workspaceId: context.workspace.id,
        contactId,
        tagIds: input.tagIds,
      })
    }),

  addTagsByName: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/tags/by-name",
      summary: "Add tags to the contact by name",
      description:
        'Same as `addTags` but takes tag names instead of ids — existing tags whose name matches are reused, unmatched names are created. Use this when you know the tag name but not its id (call `tags.list` first only if you need the id back). Example: `{"tags":["VIP"]}`.',
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(addTagsByNamePublicRequest)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      await tagService.attachByNamesToContacts({
        workspaceId,
        contactIds: [contactId],
        names: input.tags,
      })
    }),

  setTags: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}/tags",
      summary: "Replace all tags on the contact",
      description:
        'Sets the contact\'s tags to exactly this list, by tag name — tags not in `tags` are removed, new names are created as tags if they don\'t already exist. Pass an empty array to clear all tags. Example: `{"tags":["VIP","Newsletter"]}`.',
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(setAllContactTagsPublicRequest)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      await tagService.replaceContactTagsByNames({
        workspaceId,
        contactId,
        names: input.tags,
      })
    }),
}
