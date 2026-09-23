import { contactService, tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicTagResource } from "@/features/tags/schema/resource"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listContactTags } from "../../lib/list-contact-tags"
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
      summary: "Get all tags added to contact",
      description:
        "Use this to inspect tags attached to a contact after resolving its identifier with `contacts.get`. Call `contacts.addTags` to attach more tags or `tags.list` to discover available tags.",
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
          ),
      }),
    )
    .output(z.object({ data: z.array(publicTagResource) }))
    .errors(possibleErrorsOnFindingResource)
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
      summary: "Add tags to contact",
      description:
        "Attaches the given tag ids to the contact identified by `identifier`; tags already on the contact are left as-is. Use `tags.list`/`tags.create` first to resolve names to ids.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
          ),
        tagIds: z
          .array(zodBigintAsString())
          .min(1)
          .max(100)
          .describe(
            "Tag ids (numeric strings) to attach, up to 100. Get them from `tags.list`.",
          ),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Remove tags from contact",
      description:
        "Detaches the given tag ids from the contact identified by `identifier`; tags not currently on the contact are ignored. Use `contacts.listTags` to see current tags first.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
          ),
        tagIds: z
          .array(zodBigintAsString())
          .min(1)
          .max(100)
          .describe(
            "Tag ids (numeric strings) to detach, up to 100. Get them from `tags.list`.",
          ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
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
      summary: "Add tags to contact by name",
      description:
        'Same as `addTags` but takes tag names instead of ids — existing tags whose name matches are reused, unmatched names are created. Use this when you know the tag name but not its id (call `tags.list` first only if you need the id back). Example: `{"tags":["VIP"]}`.',
      successStatus: 204,
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(addTagsByNamePublicRequest)
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Replace all tags on contact",
      description:
        'Sets the contact\'s tags to exactly this list, by tag name — tags not in `tags` are removed, new names are created as tags if they don\'t already exist. Pass an empty array to clear all tags. Example: `{"tags":["VIP","Newsletter"]}`.',
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(setAllContactTagsPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
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
