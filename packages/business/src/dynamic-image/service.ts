import { and, db, eq, ilike } from "@chatbotx.io/database/client"
import type { DynamicImageDocument } from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  dynamicImageModel,
} from "@chatbotx.io/database/schema"
import type { DynamicImageModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import { isSsrfUnsafeUrl } from "../net/ssrf-guard"
import { resolveTenantSettings } from "../platform/settings"
import { toPublicStorageUrl } from "../utils"
import { renderDynamicLayer, renderStaticLayer } from "./render"

const HTTP_URL_RE = /^https?:\/\//i

// Every save gets its own timestamped background file — never overwrite the
// same key — so the URL itself changes whenever the content does. A CDN (or
// any other cache) in front of storage can never serve a stale background
// for a save that hasn't happened yet, because there is no shared URL to
// have cached in the first place.
const BACKGROUND_FILES_PREFIX = (workspaceId: string, id: string) =>
  `public/space/${workspaceId}/dynamic-images/${id}/background`

const BACKGROUND_PATH = (workspaceId: string, id: string, version: number) =>
  `${BACKGROUND_FILES_PREFIX(workspaceId, id)}_${version}.png`

const CONTACT_IMAGES_FOLDER = (workspaceId: string, id: string) =>
  `public/space/${workspaceId}/dynamic-images/${id}/contacts/`

const CONTACT_IMAGE_PATH = (
  workspaceId: string,
  id: string,
  contactId: string,
) => `${CONTACT_IMAGES_FOLDER(workspaceId, id)}${contactId}.png`

const BACKGROUND_VERSION_RE = /background_(\d+)\.png$/

/**
 * Pulls the save's version number back out of `background_<version>.png` —
 * the same number every per-contact render against that background should
 * be tagged with, so the tag identifies "which save" rather than "when this
 * one contact happened to render" (two contacts rendered off the same save
 * get the same tag; a new save changes it for all of them at once).
 */
function getBackgroundVersion(backgroundUrl: string): string {
  return BACKGROUND_VERSION_RE.exec(backgroundUrl)?.[1] ?? String(Date.now())
}

/**
 * Deletes every object under `prefix`, paginating through S3's listing.
 * Best-effort: some S3-compatible backends return a client error (e.g.
 * NoSuchKey) for ListObjectsV2 against a prefix with no matching keys yet,
 * instead of an empty result. The file(s) this is meant to clean up are
 * already orphaned and harmless either way, so a failure here must never
 * abort the save that just succeeded — it's swept again on the next save.
 */
async function deleteObjectsByPrefix(
  prefix: string,
  options: { except?: string } = {},
): Promise<void> {
  try {
    let continuationToken: string | undefined
    do {
      const listed = await uploader.listObjects(prefix, {
        ContinuationToken: continuationToken,
      })
      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key) && key !== options.except)

      await Promise.all(keys.map((key) => uploader.deleteObject(key)))

      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined
    } while (continuationToken)
  } catch (error) {
    logger.warn(
      { prefix, error },
      "dynamic-image: failed to clean up old files under prefix",
    )
  }
}

type ListInput = {
  workspaceId: string
  page?: number
  perPage?: number
  name?: string
  sort?: { id: string; desc: boolean }[]
}

type UpsertInput = {
  workspaceId: string
  name: string
  customFieldId?: string | null
  data: DynamicImageDocument
}

class DynamicImageService extends BaseService {
  async list(input: ListInput) {
    const pagination = getPaginationWithDefaults(input)
    const whereSQL = and(
      eq(dynamicImageModel.workspaceId, input.workspaceId),
      input.name
        ? ilike(dynamicImageModel.name, likeContains(input.name))
        : undefined,
    )
    const orderBy = parseOrderBy(dynamicImageModel, input)

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(dynamicImageModel)
        .where(whereSQL)
        .orderBy(...orderBy)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.$count(dynamicImageModel, whereSQL),
    ])

    return {
      data: rows,
      pageCount: Math.ceil(totalRows / (input.perPage ?? pagination.limit)),
    }
  }

  async find(input: {
    workspaceId: string
    id: string
  }): Promise<DynamicImageModel> {
    const row = await db.query.dynamicImageModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    if (!row) {
      throw notFoundException("Dynamic image not found")
    }
    return row
  }

  /**
   * Looks up a config by id alone, with no workspace scoping — used only by
   * the public `/dynamic-images` trigger route, which receives no workspaceId
   * in its URL. Callers MUST cross-check the returned `workspaceId` against
   * the resolved contact's workspace before using the row for anything.
   */
  async findUnscoped(id: string): Promise<DynamicImageModel | null> {
    return (
      (await db.query.dynamicImageModel.findFirst({ where: { id } })) ?? null
    )
  }

  private async renderAndUploadBackground(input: {
    workspaceId: string
    id: string
    data: DynamicImageDocument
  }): Promise<string> {
    const buffer = await renderStaticLayer(input.data)
    const path = BACKGROUND_PATH(input.workspaceId, input.id, Date.now())
    await uploader.putObject(path, buffer, {
      ACL: "public-read",
      ContentType: "image/png",
      // This exact path is only ever written once (the timestamp makes it
      // unique per save), so it's safe — and better for a CDN's origin
      // load — to cache it as long as a client wants to keep it.
      CacheControl: "public, max-age=31536000, immutable",
    })

    // Old background files (including any left over from before this
    // versioned-filename scheme) are now orphaned — remove them so storage
    // doesn't accumulate one file per save forever.
    await deleteObjectsByPrefix(
      BACKGROUND_FILES_PREFIX(input.workspaceId, input.id),
      { except: path },
    )

    return path
  }

  async create(input: UpsertInput): Promise<DynamicImageModel> {
    const id = createId()
    const backgroundUrl = await this.renderAndUploadBackground({
      workspaceId: input.workspaceId,
      id,
      data: input.data,
    })

    await db.insert(dynamicImageModel).values({
      id,
      workspaceId: input.workspaceId,
      name: input.name,
      customFieldId: input.customFieldId,
      data: input.data,
      backgroundUrl,
    })

    return await this.find({ workspaceId: input.workspaceId, id })
  }

  async update(
    input: UpsertInput & { id: string },
  ): Promise<DynamicImageModel> {
    const existing = await this.find({
      workspaceId: input.workspaceId,
      id: input.id,
    })

    const backgroundUrl = await this.renderAndUploadBackground({
      workspaceId: input.workspaceId,
      id: input.id,
      data: input.data,
    })

    await db
      .update(dynamicImageModel)
      .set({
        name: input.name,
        customFieldId: input.customFieldId,
        data: input.data,
        backgroundUrl,
      })
      .where(
        and(
          eq(dynamicImageModel.id, input.id),
          eq(dynamicImageModel.workspaceId, input.workspaceId),
        ),
      )

    // The background changed, so every previously rendered per-contact image
    // (composited on top of the OLD background) is stale — clear them so the
    // next visit to the trigger URL re-renders against the new one. Clearing
    // must target the field that was actually caching values BEFORE this
    // update (existing.customFieldId) — if the caller also changed the cache
    // field in this same call, the NEW field never held a cached value in
    // the first place.
    await this.clearRenderedContactImages({
      workspaceId: input.workspaceId,
      id: input.id,
      customFieldId: existing.customFieldId,
    })

    return await this.find({ workspaceId: input.workspaceId, id: input.id })
  }

  /**
   * Deletes every previously rendered per-contact image for this config from
   * storage, and clears the cached URL (if the config caches onto a custom
   * field) for every contact — forcing a fresh render on next visit.
   */
  private async clearRenderedContactImages(input: {
    workspaceId: string
    id: string
    customFieldId?: string | null
  }): Promise<void> {
    await deleteObjectsByPrefix(
      CONTACT_IMAGES_FOLDER(input.workspaceId, input.id),
    )

    if (input.customFieldId) {
      const rows = await db
        .select({ contactId: contactCustomFieldModel.contactId })
        .from(contactCustomFieldModel)
        .where(eq(contactCustomFieldModel.customFieldId, input.customFieldId))

      await contactCustomFieldService.deleteByCustomFieldId({
        workspaceId: input.workspaceId,
        contactIds: rows.map((row) => row.contactId),
        customFieldId: input.customFieldId,
      })
    }
  }

  async setEnabled(
    ctx: { workspaceId: string; id: string },
    enabled: boolean,
  ): Promise<DynamicImageModel> {
    await this.find(ctx)

    await db
      .update(dynamicImageModel)
      .set({ enabled })
      .where(
        and(
          eq(dynamicImageModel.id, ctx.id),
          eq(dynamicImageModel.workspaceId, ctx.workspaceId),
        ),
      )

    return await this.find(ctx)
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const existing = await this.find(input)

    await this.clearRenderedContactImages({
      workspaceId: input.workspaceId,
      id: input.id,
      customFieldId: existing.customFieldId,
    })
    await deleteObjectsByPrefix(
      BACKGROUND_FILES_PREFIX(input.workspaceId, input.id),
    )

    await db
      .delete(dynamicImageModel)
      .where(
        and(
          eq(dynamicImageModel.id, input.id),
          eq(dynamicImageModel.workspaceId, input.workspaceId),
        ),
      )
  }

  /**
   * Public URL for the config's static background — served when the trigger
   * URL carries no `userId`, or one that resolves to no contact, so the
   * image still renders instead of erroring out.
   */
  async resolveBackgroundUrl(
    input: Pick<DynamicImageModel, "workspaceId" | "backgroundUrl">,
  ): Promise<string | null> {
    if (!input.backgroundUrl) {
      return null
    }
    const settings = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })
    return toPublicStorageUrl(input.backgroundUrl, settings.storageUrl)
  }

  /**
   * Returns a previously cached URL for this contact, if the config caches
   * onto a custom field and that field already holds a valid URL.
   */
  async findCachedUrlForContact(input: {
    dynamicImage: Pick<DynamicImageModel, "customFieldId">
    contactId: string
  }): Promise<string | null> {
    if (!input.dynamicImage.customFieldId) {
      return null
    }
    const value = await contactCustomFieldService.findValue({
      contactId: input.contactId,
      customFieldId: input.dynamicImage.customFieldId,
    })
    return value && HTTP_URL_RE.test(value) ? value : null
  }

  /**
   * Fills in `url` for `avatarUser`/`customField` image elements from the
   * contact's data. Text/QR `{{variable}}` placeholders are left untouched —
   * the caller resolves those via `@chatbotx.io/variables` before rendering.
   */
  async resolveDynamicElements(input: {
    workspaceId: string
    contactId: string
    document: DynamicImageDocument
  }): Promise<DynamicImageDocument> {
    const elements = await Promise.all(
      input.document.elements.map(async (element) => {
        if (element.type !== "image") {
          return element
        }
        if (element.imageType === "avatarUser") {
          const url = await this.findContactAvatarUrl({
            workspaceId: input.workspaceId,
            contactId: input.contactId,
          })
          return url ? { ...element, url } : element
        }
        if (element.imageType === "customField" && element.customFieldId) {
          const value = await contactCustomFieldService.findValue({
            contactId: input.contactId,
            customFieldId: element.customFieldId,
          })
          if (!value || (await isSsrfUnsafeUrl(value))) {
            return element
          }
          return { ...element, url: value }
        }
        return element
      }),
    )
    return { ...input.document, elements }
  }

  /**
   * Renders the dynamic layers for one contact on top of the cached
   * background, uploads the result, caches the URL (if configured), and
   * returns the final public URL. `resolvedDocument` must already have every
   * `{{variable}}` in its text elements substituted by the caller.
   * `dynamicElementIds` must come from `getDynamicElementIds` on the
   * ORIGINAL, unresolved document — see the note on `renderDynamicLayer`.
   */
  async renderForContact(input: {
    workspaceId: string
    dynamicImage: Pick<
      DynamicImageModel,
      "id" | "backgroundUrl" | "customFieldId"
    >
    contactId: string
    resolvedDocument: DynamicImageDocument
    dynamicElementIds: ReadonlySet<string>
  }): Promise<string> {
    const { workspaceId, dynamicImage, contactId, resolvedDocument } = input
    if (!dynamicImage.backgroundUrl) {
      throw notFoundException("Dynamic image has no rendered background")
    }

    const settings = await resolveTenantSettings({ workspaceId })

    // Reads the object directly from storage (S3 GetObject), never through
    // the public CDN-fronted URL: a CDN sitting in front of `/storage/*` can
    // cache that URL's response for hours, so a `fetch()` here right after
    // `renderAndUploadBackground` just wrote a new version could composite
    // this contact's image on top of a STALE background — a correctness bug,
    // not just a stale thumbnail in someone's browser.
    const backgroundBuffer = await uploader.getObject(
      dynamicImage.backgroundUrl,
    )

    const buffer = await renderDynamicLayer({
      document: resolvedDocument,
      backgroundBuffer,
      dynamicElementIds: input.dynamicElementIds,
    })

    const path = CONTACT_IMAGE_PATH(workspaceId, dynamicImage.id, contactId)
    await uploader.putObject(path, buffer, {
      ACL: "public-read",
      ContentType: "image/png",
      // The path is stable across saves/re-renders (same background.png /
      // contacts/<id>.png key every time), so a CDN in front of storage must
      // revalidate on every request instead of blindly serving a long-lived
      // cached copy — otherwise edits never show up until the cache expires.
      CacheControl: "no-cache",
    })

    const baseUrl = toPublicStorageUrl(path, settings.storageUrl)
    if (!baseUrl) {
      throw new Error("Failed to build public URL for rendered dynamic image")
    }

    // Same idea as the timestamped `background_<ts>.png` filename, applied
    // as a query param instead of renaming this file: this contact's path
    // is still fixed (`contacts/<contactId>.png`), so a CDN caching the bare
    // URL would keep serving this exact render's bytes even after the next
    // save produces new ones. Reusing the background's own version (rather
    // than a fresh `Date.now()`) ties the tag to "which save produced this"
    // instead of "when this one contact happened to render" — the next save
    // wipes this cache row (`clearRenderedContactImages`) and stamps a new
    // background version, so no stale query string ever gets reused.
    const url = `${baseUrl}?timestamp=${getBackgroundVersion(dynamicImage.backgroundUrl)}`

    if (dynamicImage.customFieldId) {
      await contactCustomFieldService.setValues({
        workspaceId,
        contactId,
        fields: [{ customFieldId: dynamicImage.customFieldId, value: url }],
      })
    }

    return url
  }

  /** Resolves the contact's avatar (used for `imageType: "avatarUser"` layers). */
  private async findContactAvatarUrl(input: {
    workspaceId: string
    contactId: string
  }): Promise<string | null> {
    const contact = await db.query.contactModel.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      columns: { avatar: true },
    })
    if (!contact?.avatar) {
      return null
    }
    const settings = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })
    return toPublicStorageUrl(contact.avatar, settings.storageUrl)
  }
}

export const dynamicImageService = new DynamicImageService()
