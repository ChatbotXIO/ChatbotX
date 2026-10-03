import {
  assertPublicUrl,
  buildContext,
  messengerMessageTemplateService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { createPageMessageTemplate } from "@chatbotx.io/integration-messenger/apis/message-templates"
import { resumableUploadImage } from "@chatbotx.io/integration-messenger/apis/upload"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { SdkException } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import { integrations } from "@/integration"
import type { CreateMessengerMessageTemplateRequest } from "../schema/mutation"
import { buildMessengerMessageTemplateComponents } from "./build-template-components"

// The shared Messenger template operations behind both the builder actions and
// the public API: one implementation, so the SSRF policy, the cache
// invalidation and the Meta calls cannot drift between the two callers.

const CLONE_BATCH_SIZE = 5

const messengerTemplatesCacheTag = (workspaceId: string): string =>
  `workspaces:${workspaceId}#messenger#messageTemplates`

export const invalidateMessengerTemplatesCache = (
  workspaceIds: Iterable<string>,
): Promise<void> =>
  invalidateCacheByTags(
    [...new Set(workspaceIds)].map((id) => messengerTemplatesCacheTag(id)),
  )

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function isMetaImageUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname
    return (
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname.endsWith(".fbcdn.net") ||
      hostname.endsWith(".fbsbx.com")
    )
  } catch {
    return false
  }
}

function stripLegacyInternalHeaderImageUrl(
  // biome-ignore lint/suspicious/noExplicitAny: Meta component example shape varies
  example: any,
) {
  if (!example || typeof example !== "object") {
    return example
  }

  const { header_image_url: _headerImageUrl, ...rest } = example
  return rest
}

function getStoredHeaderImageUrl(
  // biome-ignore lint/suspicious/noExplicitAny: Meta component shape varies
  component: any,
): string | undefined {
  const headerHandle: string | undefined = component.example?.header_handle?.[0]
  if (headerHandle && isHttpUrl(headerHandle)) {
    return headerHandle
  }

  const legacyInternalImageUrl: string | undefined =
    component.example?.header_image_url
  if (legacyInternalImageUrl && isHttpUrl(legacyInternalImageUrl)) {
    return legacyInternalImageUrl
  }

  return
}

function withHeaderHandle(
  // biome-ignore lint/suspicious/noExplicitAny: Meta component shape varies
  component: any,
  headerHandle: string,
) {
  return {
    ...component,
    example: {
      ...stripLegacyInternalHeaderImageUrl(component.example),
      header_handle: [headerHandle],
    },
  }
}

/**
 * Downloads `imageUrl` and uploads it to the Page for a template header. Every
 * image URL that reaches Meta's uploader goes through here: it must resolve to
 * a public address (a caller-supplied or stored URL is otherwise a way to make
 * the server fetch internal hosts).
 */
async function uploadHeaderImage(
  auth: MessengerAuthValue,
  imageUrl: string,
  options: { authenticatedDownload: boolean },
): Promise<string> {
  await assertPublicUrl(imageUrl, "Template header image URL")
  try {
    return await resumableUploadImage(auth, imageUrl, options)
  } catch (error) {
    // A bad image (not an image, too large, unreachable) is the caller's to
    // fix: a 4xx with the reason, not a 500. Meta's own errors keep their type.
    if (error instanceof SdkException || !(error instanceof Error)) {
      throw error
    }
    throw new ChatbotXException(error.message)
  }
}

// IMAGE header handles are page-scoped. The DB stores Meta's listed image URL in
// example.header_handle[0], while the create-template request needs a freshly
// uploaded handle for each target Page.
export async function prepareComponentsForClone(
  // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
  components: any[],
  auth: MessengerAuthValue,
  // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
): Promise<any[]> {
  return await Promise.all(
    // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
    components.map(async (c: any) => {
      if (
        c.type?.toUpperCase() !== "HEADER" ||
        c.format?.toUpperCase() !== "IMAGE"
      ) {
        return c
      }
      const storedHeaderImageUrl = getStoredHeaderImageUrl(c)

      if (!storedHeaderImageUrl) {
        throw new Error(
          "Image header cannot be cloned because Meta returned a page-owned file handle instead of a downloadable image URL. Recreate the template on the target channel with the original image.",
        )
      }

      return withHeaderHandle(
        c,
        // Only Meta's own CDN hosts are fetched with the Page token.
        await uploadHeaderImage(auth, storedHeaderImageUrl, {
          authenticatedDownload: isMetaImageUrl(storedHeaderImageUrl),
        }),
      )
    }),
  )
}

/**
 * Pulls the Page's templates from Meta into the local table (all of them, or
 * the one just created/cloned), then drops the cached lists.
 */
export async function syncMessengerMessageTemplatesForIntegration({
  workspaceId,
  integrationMessenger,
  templateId,
  templateName,
  templateLanguage,
}: {
  workspaceId: string
  integrationMessenger: IntegrationMessengerModel
  templateId?: string
  templateName?: string
  templateLanguage?: string
}) {
  const isPartialSync = Boolean(templateId || templateName || templateLanguage)
  const ctx = await buildContext({
    workspaceId,
    integrationType: "messenger",
    integration: {
      ...integrationMessenger,
      auth: integrationMessenger.auth as MessengerAuthValue,
    },
  })
  let res: Awaited<
    ReturnType<typeof integrations.messenger.runAction<"listMessageTemplates">>
  >
  try {
    res = await integrations.messenger.runAction("listMessageTemplates", {
      ctx,
      input: templateName ? { name: templateName } : undefined,
    })
  } catch (error) {
    throw new SdkException(
      `Failed to fetch Messenger templates from Facebook API: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const templates = res.data.filter((template) => {
    if (templateId && template.id !== templateId) {
      return false
    }

    if (templateName && template.name !== templateName) {
      return false
    }

    if (templateLanguage && template.language !== templateLanguage) {
      return false
    }

    return true
  })

  await messengerMessageTemplateService.syncFromMeta({
    integrationMessengerId: integrationMessenger.id,
    templates,
    isPartialSync,
  })
}

export type CreatedMessengerTemplate = {
  id: string
  status: string
  rejectionReason?: string
  specificRejectionReason?: string
}

/**
 * Creates a utility template on the Page (uploading the header image first when
 * there is one), mirrors it locally and drops the cached lists. A template Meta
 * rejects is still created and mirrored: the caller decides how to report it.
 */
export async function createMessengerMessageTemplate(props: {
  workspaceId: string
  integrationMessenger: IntegrationMessengerModel
  request: CreateMessengerMessageTemplateRequest
}): Promise<CreatedMessengerTemplate> {
  const { workspaceId, integrationMessenger, request } = props
  const auth = integrationMessenger.auth as MessengerAuthValue
  const headerHandle =
    request.headerType === "text_and_image" && request.headerImageUrl
      ? await uploadHeaderImage(auth, request.headerImageUrl, {
          authenticatedDownload: false,
        })
      : undefined

  const resp = await createPageMessageTemplate(auth, {
    name: request.name,
    language: request.language,
    category: "UTILITY",
    components: buildMessengerMessageTemplateComponents(request, headerHandle),
  })

  await syncMessengerMessageTemplatesForIntegration({
    workspaceId,
    integrationMessenger,
    templateId: resp.id,
    templateName: request.name,
    templateLanguage: request.language,
  })
  await invalidateMessengerTemplatesCache([workspaceId])

  return {
    id: resp.id,
    status: resp.status,
    rejectionReason: resp.rejection_reason,
    specificRejectionReason: resp.specific_rejection_reason,
  }
}

export type CloneTemplateResult = {
  succeeded: { channel: string }[]
  failed: { channel: string; error: string }[]
}

type CloneSourceTemplate = {
  name: string
  category: string
  language: string
  parameterFormat: string
  components: unknown
}

/**
 * Creates the source template on every target Page (already authorized by the
 * caller: the builder allows the Pages the user administers, the public API
 * only Pages of the token's workspace). A target that fails is reported without
 * blocking the others.
 */
export async function cloneMessengerMessageTemplate(props: {
  sourceWorkspaceId: string
  sourceTemplate: CloneSourceTemplate
  targets: IntegrationMessengerModel[]
}): Promise<CloneTemplateResult> {
  const { sourceTemplate, targets } = props
  const result: CloneTemplateResult = { succeeded: [], failed: [] }

  const cloneOne = async (target: IntegrationMessengerModel): Promise<void> => {
    const auth = target.auth as MessengerAuthValue
    try {
      // Re-upload IMAGE headers to the target page before creating the template.
      const components = await prepareComponentsForClone(
        // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
        sourceTemplate.components as any[],
        auth,
      )

      const resp = await createPageMessageTemplate(auth, {
        name: sourceTemplate.name,
        category: sourceTemplate.category as
          | "AUTHENTICATION"
          | "MARKETING"
          | "UTILITY",
        language: sourceTemplate.language,
        parameter_format: sourceTemplate.parameterFormat,
        components,
      })

      if (resp.status === "APPROVED") {
        await syncMessengerMessageTemplatesForIntegration({
          workspaceId: target.workspaceId,
          integrationMessenger: target,
          templateId: resp.id,
          templateName: sourceTemplate.name,
          templateLanguage: sourceTemplate.language,
        })
        result.succeeded.push({ channel: target.name })
      } else {
        result.failed.push({
          channel: target.name,
          error: `Template returned status: ${resp.status}`,
        })
      }
    } catch (error) {
      // Never the raw message: a failed local write carries SQL and bound
      // parameters. Meta's and our own validation messages survive.
      result.failed.push({
        channel: target.name,
        error: toPublicErrorMessage(error, "Could not clone the template"),
      })
    }
  }

  for (const batch of chunk(targets, CLONE_BATCH_SIZE)) {
    await Promise.allSettled(batch.map(cloneOne))
  }

  // Revalidate every workspace that received a clone, plus the source.
  await invalidateMessengerTemplatesCache([
    props.sourceWorkspaceId,
    ...targets.map((target) => target.workspaceId),
  ])

  return result
}
