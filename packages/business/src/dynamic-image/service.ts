import {
  and,
  type DatabaseClient,
  db,
  eq,
  ilike,
  inArray,
} from "@chatbotx.io/database/client"
import type { DynamicImageDocument } from "@chatbotx.io/database/partials"
import { dynamicImageStaleBackgroundRepository } from "@chatbotx.io/database/repositories"
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
import {
  ChatbotXException,
  conflictException,
  notFoundException,
} from "../errors"
import { logger } from "../logger"
import { type EnsureAvatarMirrored, resolveContactAvatarUrl } from "../media"
import { isSsrfUnsafeUrl } from "../net/ssrf-guard"
import { resolveTenantSettings } from "../platform/settings"
import {
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
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

const BACKGROUND_PATH = (workspaceId: string, id: string, version: string) =>
  `${BACKGROUND_FILES_PREFIX(workspaceId, id)}_${version}.png`

const CONTACT_IMAGES_FOLDER = (workspaceId: string, id: string) =>
  `public/space/${workspaceId}/dynamic-images/${id}/contacts/`

const CONTACT_IMAGE_PATH = (
  workspaceId: string,
  id: string,
  contactId: string,
) => `${CONTACT_IMAGES_FOLDER(workspaceId, id)}${contactId}.png`

const VERSION_SUFFIX_RANGE = 1_000_000_000
const VERSION_SUFFIX_DIGITS = 9

/**
 * Milliseconds plus nine random digits (Web Crypto — no `node:crypto` in this
 * module's graph): two writers (a save and a re-render) in the same
 * millisecond collide with probability ~1e-9, not ~1e-3. Delete paths also
 * refuse to remove the key just committed (see `deleteSupersededBackground`).
 */
const uniqueBackgroundVersion = (): string =>
  `${Date.now()}${String(
    crypto.getRandomValues(new Uint32Array(1))[0] % VERSION_SUFFIX_RANGE,
  ).padStart(VERSION_SUFFIX_DIGITS, "0")}`

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

/**
 * A background the template install staged lives under the tool-image root of
 * the workspace, not under the standard per-image prefix, so the sweep of that
 * prefix never reaches it: it is deleted by key once the row stops using it.
 */
const isStagedBackground = (
  workspaceId: string,
  backgroundUrl: string | null,
): boolean =>
  Boolean(
    backgroundUrl?.startsWith(
      `public/space/${workspaceId}/template-tool-images/`,
    ),
  ) && !backgroundUrl?.includes("..")

async function deleteStagedBackground(
  workspaceId: string,
  backgroundUrl: string | null,
): Promise<void> {
  if (!(backgroundUrl && isStagedBackground(workspaceId, backgroundUrl))) {
    return
  }
  try {
    await uploader.deleteObject(backgroundUrl)
  } catch (error) {
    logger.warn(
      { backgroundUrl, error },
      "dynamic-image: failed to delete a staged background",
    )
  }
}

/** Removes the one file a skipped re-render uploaded (best-effort, never the row's own). */
async function deleteOwnBackground(path: string): Promise<void> {
  try {
    await uploader.deleteObject(path)
  } catch (error) {
    logger.warn({ path, error }, "dynamic-image: failed to delete a new file")
  }
}

/**
 * The one background a write replaced, by key (never a sweep of the folder).
 * `committedUrl` is the key that write just stored: it is never deleted, even
 * if a key collision made it look "superseded".
 */
async function deleteSupersededBackground(
  workspaceId: string,
  id: string,
  backgroundUrl: string,
  committedUrl: string,
): Promise<void> {
  if (backgroundUrl === committedUrl) {
    return
  }
  if (isStagedBackground(workspaceId, backgroundUrl)) {
    await deleteStagedBackground(workspaceId, backgroundUrl)
    return
  }
  if (
    backgroundUrl.startsWith(BACKGROUND_FILES_PREFIX(workspaceId, id)) &&
    !backgroundUrl.includes("..")
  ) {
    await deleteOwnBackground(backgroundUrl)
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

type AvatarContactInbox = NonNullable<
  Parameters<typeof resolveContactAvatarUrl>[0]["contactInbox"]
>

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
    /** False when the file must only replace the old ones once the row points at it. */
    sweepOld?: boolean
  }): Promise<string> {
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })
    const buffer = await renderStaticLayer(input.data, {
      trustedStorageUrl: storageUrl,
    })
    const path = BACKGROUND_PATH(
      input.workspaceId,
      input.id,
      uniqueBackgroundVersion(),
    )
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
    if (input.sweepOld !== false) {
      await this.sweepOldBackgrounds(input.workspaceId, input.id, path)
    }

    return path
  }

  private async sweepOldBackgrounds(
    workspaceId: string,
    id: string,
    keep: string,
  ): Promise<void> {
    await deleteObjectsByPrefix(BACKGROUND_FILES_PREFIX(workspaceId, id), {
      except: keep,
    })
  }

  async create(input: UpsertInput): Promise<DynamicImageModel> {
    const id = createId()
    const backgroundUrl = await this.renderAndUploadBackground({
      workspaceId: input.workspaceId,
      id,
      data: input.data,
    })

    await this.insertInTx(db, { ...input, id, backgroundUrl })

    return await this.find({ workspaceId: input.workspaceId, id })
  }

  /**
   * The row write of `create`, shared with the template install. `backgroundUrl`
   * is a storage key that is already in place: rendering and uploading happen
   * outside any transaction.
   */
  async insertInTx(
    tx: DatabaseClient,
    input: UpsertInput & {
      id: string
      backgroundUrl: string
      enabled?: boolean
    },
  ): Promise<DynamicImageModel> {
    const [row] = await tx
      .insert(dynamicImageModel)
      .values({
        id: input.id,
        workspaceId: input.workspaceId,
        name: input.name,
        customFieldId: input.customFieldId,
        data: input.data,
        backgroundUrl: input.backgroundUrl,
        enabled: input.enabled,
      })
      .returning()
    return row
  }

  async update(
    input: UpsertInput & { id: string },
  ): Promise<DynamicImageModel> {
    const lock = {
      workspaceId: input.workspaceId,
      initialKeys: [{ kind: "dynamicImage" as const, resourceId: input.id }],
    }
    // Checked before anything is rendered or uploaded: a View-only copy must
    // refuse without leaving a new background file behind.
    const existing = await withTemplateLockedTransaction(
      (tx) => this.loadEditable(tx, input),
      lock,
    )

    // No folder sweep: a concurrent re-render may own a file in the same
    // folder. Only the file this save replaces is removed, after the commit.
    const backgroundUrl = await this.renderAndUploadBackground({
      workspaceId: input.workspaceId,
      id: input.id,
      data: input.data,
      sweepOld: false,
    })

    // Re-checked under the lock that covers the write, since the install or an
    // uninstall may have taken the row between the two transactions.
    let replaced: string | null
    try {
      replaced = await withTemplateLockedTransaction(async (tx) => {
        const locked = await this.loadEditable(tx, input)
        await tx
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
        // The save rendered a background from the stored document itself.
        await dynamicImageStaleBackgroundRepository.clear(
          { workspaceId: input.workspaceId, resourceId: input.id },
          tx,
        )
        return locked.backgroundUrl
      }, lock)
    } catch (error) {
      await deleteOwnBackground(backgroundUrl)
      throw error
    }

    if (replaced) {
      await deleteSupersededBackground(
        input.workspaceId,
        input.id,
        replaced,
        backgroundUrl,
      )
    }

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
   * Re-bakes the static background of a template copy whose `data` was changed
   * after the install wrote it (its QR or text links followed the copies), then
   * switches the image to `enabled`. Storage I/O stays outside the transaction;
   * the row write is a compare-and-set under the template lock: it applies only
   * while the row is still switched off and still points at the background read
   * first. Anything else (edited, toggled, deleted, an uninstall freezing it)
   * means the installer moved on, so nothing is overwritten and only the file
   * this call uploaded is removed. Idempotent. Returns whether it applied.
   */
  async rerenderInstalledBackground(input: {
    workspaceId: string
    id: string
    enabled: boolean
  }): Promise<boolean> {
    const existing = await db.query.dynamicImageModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    if (!existing?.backgroundUrl || existing.enabled) {
      return false
    }
    const readBackgroundUrl = existing.backgroundUrl
    const path = await this.renderAndUploadBackground({
      workspaceId: input.workspaceId,
      id: input.id,
      data: existing.data,
      sweepOld: false,
    })
    let applied = false
    try {
      applied = await withTemplateLockedTransaction(
        async (tx) => {
          try {
            await assertResourceEditable({
              workspaceId: input.workspaceId,
              resourceKind: "dynamicImage",
              resourceIds: [input.id],
              changedKeys: [],
              tx,
            })
          } catch (error) {
            if (
              error instanceof ChatbotXException &&
              error.code === "templateUninstallInProgress"
            ) {
              return false
            }
            throw error
          }
          const updated = await tx
            .update(dynamicImageModel)
            .set({ backgroundUrl: path, enabled: input.enabled })
            .where(
              and(
                eq(dynamicImageModel.id, input.id),
                eq(dynamicImageModel.workspaceId, input.workspaceId),
                eq(dynamicImageModel.enabled, false),
                eq(dynamicImageModel.backgroundUrl, readBackgroundUrl),
              ),
            )
            .returning({ id: dynamicImageModel.id })
          if (updated.length === 0) {
            return false
          }
          await dynamicImageStaleBackgroundRepository.clear(
            { workspaceId: input.workspaceId, resourceId: input.id },
            tx,
          )
          return true
        },
        {
          workspaceId: input.workspaceId,
          initialKeys: [{ kind: "dynamicImage", resourceId: input.id }],
        },
      )
    } catch (error) {
      await deleteOwnBackground(path)
      throw error
    }
    if (!applied) {
      await deleteOwnBackground(path)
      return false
    }
    // Only the file this write superseded: a prefix sweep could remove a newer
    // background a concurrent save committed after the compare-and-set.
    await deleteSupersededBackground(
      input.workspaceId,
      input.id,
      readBackgroundUrl,
      path,
    )
    await this.clearRenderedContactImages({
      workspaceId: input.workspaceId,
      id: input.id,
      customFieldId: existing.customFieldId,
    })
    return true
  }

  /** The row, refused when a View-only copy's content would change (run under the row's lock). */
  private async loadEditable(
    tx: DatabaseClient,
    input: UpsertInput & { id: string },
  ): Promise<DynamicImageModel> {
    const row = await tx.query.dynamicImageModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    if (!row) {
      throw notFoundException("Dynamic image not found")
    }
    await assertResourceEditable({
      workspaceId: input.workspaceId,
      resourceKind: "dynamicImage",
      resourceIds: [row.id],
      changedKeys: changedKeysOf(row, { name: input.name, data: input.data }),
      tx,
    })
    return row
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
    if (enabled) {
      await this.refreshStaleBackground(ctx)
    }
    await withTemplateLockedTransaction(
      async (tx) => {
        const row = await tx.query.dynamicImageModel.findFirst({
          where: { id: ctx.id, workspaceId: ctx.workspaceId },
        })
        if (!row) {
          throw notFoundException("Dynamic image not found")
        }
        // The toggle is installer-owned; this only refuses while an uninstall runs.
        await assertResourceEditable({
          workspaceId: ctx.workspaceId,
          resourceKind: "dynamicImage",
          resourceIds: [row.id],
          changedKeys: [],
          tx,
        })
        await tx
          .update(dynamicImageModel)
          .set({ enabled })
          .where(
            and(
              eq(dynamicImageModel.id, ctx.id),
              eq(dynamicImageModel.workspaceId, ctx.workspaceId),
            ),
          )
      },
      {
        workspaceId: ctx.workspaceId,
        initialKeys: [{ kind: "dynamicImage", resourceId: ctx.id }],
      },
    )

    return await this.find(ctx)
  }

  /**
   * A copy the install switched off because a baked QR or text layer was
   * rewritten carries a marker until its background is rendered again. It is
   * rendered again before it can be switched on, and stays off when that
   * fails. Any other copy (source off, or switched off by the installer) has a
   * correct background and enables with no render.
   */
  private async refreshStaleBackground(ctx: {
    workspaceId: string
    id: string
  }): Promise<void> {
    const row = await db.query.dynamicImageModel.findFirst({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
      columns: { enabled: true },
    })
    if (
      !row ||
      row.enabled ||
      !(await dynamicImageStaleBackgroundRepository.isMarked({
        workspaceId: ctx.workspaceId,
        resourceId: ctx.id,
      }))
    ) {
      return
    }
    try {
      await this.rerenderInstalledBackground({ ...ctx, enabled: false })
    } catch (error) {
      logger.error(
        { err: error, dynamicImageId: ctx.id },
        "dynamic-image: re-rendering a template copy before enabling failed",
      )
      throw conflictException(
        "This dynamic image's background could not be re-rendered, so it cannot be turned on yet. Try again.",
        "dynamicImageBackgroundStale",
      )
    }
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const existing = await this.find(input)

    await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [{ resourceKind: "dynamicImage", resourceIds: [input.id] }],
      },
      (tx) =>
        this.deleteInTx(tx, {
          workspaceId: input.workspaceId,
          ids: [input.id],
        }),
    )
    await this.cleanUpDeleted({
      ...input,
      customFieldId: existing.customFieldId,
    })
    await deleteStagedBackground(input.workspaceId, existing.backgroundUrl)
  }

  /**
   * The delete core (row write only), shared with the template uninstall so
   * there is one implementation. Returns the deleted rows' ids and cache
   * fields, which `cleanUpDeleted` needs after the commit.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<
    {
      id: string
      customFieldId: string | null
      backgroundUrl: string | null
      data: DynamicImageDocument
    }[]
  > {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .delete(dynamicImageModel)
      .where(
        and(
          eq(dynamicImageModel.workspaceId, input.workspaceId),
          inArray(dynamicImageModel.id, input.ids),
        ),
      )
      .returning({
        id: dynamicImageModel.id,
        customFieldId: dynamicImageModel.customFieldId,
        backgroundUrl: dynamicImageModel.backgroundUrl,
        data: dynamicImageModel.data,
      })
  }

  /** The storage and cache work a delete leaves for after its commit; safe to repeat. */
  async cleanUpDeleted(input: {
    workspaceId: string
    id: string
    customFieldId: string | null
  }): Promise<void> {
    await this.clearRenderedContactImages(input)
    await deleteObjectsByPrefix(
      BACKGROUND_FILES_PREFIX(input.workspaceId, input.id),
    )
  }

  /**
   * Resolves each row's `backgroundUrl` storage key into a public URL,
   * resolving tenant settings ONCE for the whole batch — the per-row
   * `resolveBackgroundUrl` would re-resolve them for every element of a list
   * page.
   */
  async resolveBackgroundUrls<
    T extends Pick<DynamicImageModel, "backgroundUrl">,
  >(input: {
    workspaceId: string
    rows: T[]
  }): Promise<(Omit<T, "backgroundUrl"> & { backgroundUrl: string | null })[]> {
    if (input.rows.length === 0) {
      return []
    }
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })
    return input.rows.map((row) => ({
      ...row,
      backgroundUrl: toPublicStorageUrl(row.backgroundUrl, storageUrl),
    }))
  }

  /**
   * Public URL for the config's static background — served when the trigger
   * URL carries no `userId`, or one that resolves to no contact, so the
   * image still renders instead of erroring out.
   */
  async resolveBackgroundUrl(
    input: Pick<DynamicImageModel, "workspaceId" | "backgroundUrl">,
  ): Promise<string | null> {
    return (
      (
        await this.resolveBackgroundUrls({
          workspaceId: input.workspaceId,
          rows: [input],
        })
      )[0]?.backgroundUrl ?? null
    )
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
    // The inbox the picture is asked from when the contact has none stored
    // yet, and the callback that fetches it (injected: business never imports
    // the channel layer). Without them only a stored picture can be used.
    contactInbox?: AvatarContactInbox | null
    ensureAvatarMirrored?: EnsureAvatarMirrored
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
            contactInbox: input.contactInbox,
            ensureAvatarMirrored: input.ensureAvatarMirrored,
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
      remoteImages: { trustedStorageUrl: settings.storageUrl },
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
    contactInbox?: AvatarContactInbox | null
    ensureAvatarMirrored?: EnsureAvatarMirrored
  }): Promise<string | null> {
    const contact = await db.query.contactModel.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      columns: { avatar: true },
    })
    if (!contact) {
      return null
    }
    const settings = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })
    // A contact created on a lazy-avatar channel has no stored picture until
    // something asks for it: resolve through the shared avatar resolver (which
    // fetches it on demand and keeps a no-avatar sentinel out of the layer)
    // instead of reading the raw column.
    return await resolveContactAvatarUrl(
      {
        workspaceId: input.workspaceId,
        contact,
        contactInbox: input.contactInbox,
      },
      (key) => toPublicStorageUrl(key, settings.storageUrl),
      input.ensureAvatarMirrored,
    )
  }
}

export const dynamicImageService = new DynamicImageService()
