import { and, db, eq } from "@chatbotx.io/database/client"
import {
  type MinigameAppearance,
  type MinigameGeneralSettings,
  type MinigameNonWinningMessageSettings,
  type MinigameOutcomeMessage,
  type MinigamePlayerSettings,
  type MinigamePrizeSettings,
  type MinigameType,
  type MinigameWinningMessageSettings,
  minigameAppearanceSchema,
  minigameGeneralSettingsSchema,
  minigameNonWinningMessageSettingsSchema,
  minigamePlayerSettingsSchema,
  minigamePrizeSettingsSchema,
  minigameWinningMessageSettingsSchema,
} from "@chatbotx.io/database/partials"
import { minigameModel } from "@chatbotx.io/database/schema"
import { minigameImageSlots } from "../../minigame/image-slots"
import { minigameService } from "../../minigame/service"
import { collectResourceDependencies } from "../manifest-references"
import { createLinkRewritePatcher } from "./link-rewrite-patcher"
import { insertCopyNamed } from "./naming"
import {
  makeCollector,
  recordCopy,
  resolveRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import {
  resolveToolImageUrl,
  stageToolImages,
  type ToolImageSlot,
} from "./staging"
import type {
  PatchTask,
  ResourceAdapter,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

type TemplateMinigameEntry = {
  sourceId: string
  name: string
  type: MinigameType
  enabled: boolean
  generalSettings: MinigameGeneralSettings
  appearance: MinigameAppearance
  playerSettings: MinigamePlayerSettings
  prizeSettings: MinigamePrizeSettings
  winningMessageSettings: MinigameWinningMessageSettings
  nonWinningMessageSettings: MinigameNonWinningMessageSettings
}

/** `minigameGeneralSettingsSchema.name` allows up to 150 characters. */
const MINIGAME_NAME_MAX_LENGTH = 150
const MINIGAME_IMAGE_SKIPPED = "minigameImage"

/**
 * What a template does with every column of `Minigame`. Plays, players and
 * winners are separate tables and never travel.
 */
export const MINIGAME_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // Also `generalSettings.name`; made unique per workspace.
  name: "copy",
  type: "copy",
  enabled: "copy",
  // Tag groups are rebound to the installer's tags.
  generalSettings: "rebind",
  // Images are staged into the installer's storage.
  appearance: "rebind",
  // The sharing flow is cleared, then written once flows exist.
  playerSettings: "rebind",
  // The prize-name field is rebound; prize images are staged.
  prizeSettings: "rebind",
  winningMessageSettings: "reference",
  nonWinningMessageSettings: "reference",
  playsCount: "reset",
  participantsCount: "reset",
  winnersCount: "reset",
  sharesCount: "reset",
} as const satisfies Record<
  keyof typeof minigameModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

const imageSlotKey = (sourceId: string, slot: string) =>
  `minigames:${sourceId}:${slot}`

/** Every image a minigame points at, by a stable slot name. */
const imageSlots = (entry: TemplateMinigameEntry): ToolImageSlot[] =>
  minigameImageSlots(entry).map(({ slot, url }) => ({
    stageKey: imageSlotKey(entry.sourceId, slot),
    url,
  }))

const withImage = <T extends { url: string }>(
  ctx: TemplateInstallContext,
  entry: TemplateMinigameEntry,
  slot: string,
  image: T,
): T =>
  image.url
    ? {
        ...image,
        url: resolveToolImageUrl(ctx, {
          stageKey: imageSlotKey(entry.sourceId, slot),
          url: image.url,
          category: "minigames",
          skippedKind: MINIGAME_IMAGE_SKIPPED,
          path: `minigames.${entry.sourceId}.${slot}`,
        }),
      }
    : image

/** The tags a group names, mapped to the installer's; one that did not come along is dropped with a warning. */
const remapTags = (
  ctx: TemplateInstallContext,
  entry: TemplateMinigameEntry,
  field: "openerTagIds" | "playerTagIds" | "newFriendTagIds",
): string[] =>
  entry.generalSettings[field].flatMap((tagId) => {
    const target = ctx.idMaps.tag?.get(tagId)
    if (target) {
      return [target]
    }
    ctx.warn({
      category: "minigames",
      entityKind: "tag",
      path: `minigames.${entry.sourceId}.generalSettings.${field}`,
      value: tagId,
    })
    return []
  })

/**
 * The follow-up message with its flow turned off until flows exist: the flow
 * ids are written by the Phase-2 patch, once every flow of the install does.
 */
const withoutFlow = (
  message: MinigameOutcomeMessage,
): MinigameOutcomeMessage =>
  message.mode === "text" ? message : { ...message, flowId: null }

/** The flow references of one minigame, resolved against the flows this install created. */
const withFlows = (
  ctx: TemplateInstallContext,
  sourceId: string,
  entry: LinkedMinigameBlocks,
) => {
  const resolve = (path: string, flowId: string | null): string | null =>
    resolveRef(ctx, {
      category: "minigames",
      kind: "flow",
      path: `minigames.${sourceId}.${path}`,
      sourceRef: flowId,
    })
  const sharingFlowId = resolve(
    "playerSettings.sharingFlowId",
    entry.playerSettings.sharingFlowId,
  )
  const outcome = (
    path: string,
    message: MinigameOutcomeMessage,
  ): MinigameOutcomeMessage => {
    if (message.mode === "text") {
      return message
    }
    const flowId = resolve(`${path}.flowId`, message.flowId)
    // A message that names a flow that did not come along sends nothing.
    return { ...message, flowId, enabled: message.enabled && flowId !== null }
  }
  return {
    playerSettings: {
      ...entry.playerSettings,
      sharingFlowId,
      // The share button needs both; the node lives in the same flow.
      sharingNodeId: sharingFlowId ? entry.playerSettings.sharingNodeId : null,
    },
    winningMessageSettings: {
      ...entry.winningMessageSettings,
      outcomeMessage: outcome(
        "winningMessageSettings.outcomeMessage",
        entry.winningMessageSettings.outcomeMessage,
      ),
    },
    nonWinningMessageSettings: {
      ...entry.nonWinningMessageSettings,
      outcomeMessage: outcome(
        "nonWinningMessageSettings.outcomeMessage",
        entry.nonWinningMessageSettings.outcomeMessage,
      ),
    },
  }
}

/** The stored blocks that hold text a public link can sit in (rules, dialogs, follow-up messages) or a flow. */
type LinkedMinigameBlocks = Pick<
  TemplateMinigameEntry,
  | "generalSettings"
  | "playerSettings"
  | "winningMessageSettings"
  | "nonWinningMessageSettings"
>

/** The parts of one entry that are rebound to the installer's workspace before the insert. */
type PreparedMinigame = {
  appearance: MinigameAppearance
  prizeSettings: MinigamePrizeSettings
  tagGroups: Pick<
    MinigameGeneralSettings,
    "openerTagIds" | "playerTagIds" | "newFriendTagIds"
  >
}

/** Rebinds the prize-name field, images and tags of one entry (warning for what did not come along). */
const prepareMinigame = (
  ctx: TemplateInstallContext,
  entry: TemplateMinigameEntry,
): PreparedMinigame => {
  const prizeNameCustomFieldId = resolveRef(ctx, {
    category: "minigames",
    kind: "customField",
    path: `minigames.${entry.sourceId}.prizeSettings.prizeNameCustomFieldId`,
    sourceRef: entry.prizeSettings.prizeNameCustomFieldId,
  })
  const appearance = minigameAppearanceSchema.parse({
    ...entry.appearance,
    backgroundImage: withImage(
      ctx,
      entry,
      "background",
      entry.appearance.backgroundImage,
    ),
    prizeDescriptionImage: withImage(
      ctx,
      entry,
      "prizeDescription",
      entry.appearance.prizeDescriptionImage,
    ),
    startButtonImage: withImage(
      ctx,
      entry,
      "startButton",
      entry.appearance.startButtonImage,
    ),
  })
  const prizeSettings = minigamePrizeSettingsSchema.parse({
    ...entry.prizeSettings,
    prizeNameCustomFieldId,
    nonWinning: {
      ...entry.prizeSettings.nonWinning,
      loseImage: withImage(
        ctx,
        entry,
        "loseImage",
        entry.prizeSettings.nonWinning.loseImage,
      ),
    },
    prizes: entry.prizeSettings.prizes.map((prize, index) => ({
      ...prize,
      icon: withImage(ctx, entry, `prize:${index}`, prize.icon),
    })),
  })
  return {
    appearance,
    prizeSettings,
    tagGroups: {
      openerTagIds: remapTags(ctx, entry, "openerTagIds"),
      playerTagIds: remapTags(ctx, entry, "playerTagIds"),
      newFriendTagIds: remapTags(ctx, entry, "newFriendTagIds"),
    },
  }
}

/** The row values of one entry under the free name; the flows wait for the Phase-2 patch. */
const insertValuesOf = (
  workspaceId: string,
  entry: TemplateMinigameEntry,
  prepared: PreparedMinigame,
  name: string,
): Parameters<typeof minigameService.insertInTx>[1] => ({
  workspaceId,
  type: entry.type,
  enabled: entry.enabled,
  // The name is the general settings' name too.
  generalSettings: minigameGeneralSettingsSchema.parse({
    ...entry.generalSettings,
    name,
    ...prepared.tagGroups,
  }),
  appearance: prepared.appearance,
  playerSettings: minigamePlayerSettingsSchema.parse({
    ...entry.playerSettings,
    sharingFlowId: null,
    sharingNodeId: null,
  }),
  prizeSettings: prepared.prizeSettings,
  winningMessageSettings: minigameWinningMessageSettingsSchema.parse({
    ...entry.winningMessageSettings,
    outcomeMessage: withoutFlow(entry.winningMessageSettings.outcomeMessage),
  }),
  nonWinningMessageSettings: minigameNonWinningMessageSettingsSchema.parse({
    ...entry.nonWinningMessageSettings,
    outcomeMessage: withoutFlow(entry.nonWinningMessageSettings.outcomeMessage),
  }),
})

/** Defers the Phase-2 write of one copied minigame: links and flows follow the copies once they exist. */
const deferMinigamePatch = (
  patcher: ReturnType<typeof createLinkRewritePatcher<LinkedMinigameBlocks>>,
  entry: TemplateMinigameEntry,
  created: { id: string; generalSettings: MinigameGeneralSettings },
): void => {
  patcher.defer({
    sourceId: entry.sourceId,
    original: {
      generalSettings: created.generalSettings,
      playerSettings: entry.playerSettings,
      winningMessageSettings: entry.winningMessageSettings,
      nonWinningMessageSettings: entry.nonWinningMessageSettings,
    },
    finish: (linked, patchCtx) => {
      const {
        playerSettings,
        winningMessageSettings,
        nonWinningMessageSettings,
      } = withFlows(patchCtx, entry.sourceId, linked)
      return {
        generalSettings: linked.generalSettings,
        playerSettings,
        winningMessageSettings,
        nonWinningMessageSettings,
      }
    },
    write: async (tx, values, patchCtx) => {
      await tx
        .update(minigameModel)
        .set(values)
        .where(
          and(
            eq(minigameModel.id, created.id),
            eq(minigameModel.workspaceId, patchCtx.workspaceId),
          ),
        )
    },
  })
}

/**
 * A minigame is copied with its settings, prizes (and remaining stock, which
 * the schema keeps as the one quantity) and images; plays, players and the four
 * counters never travel. Tags and the prize-name field are rebound at insert;
 * the flows (sharing, follow-up messages) are written once flows exist. The
 * name is the minigame's `generalSettings.name` too, so a rename changes both.
 */
export const minigamesAdapter: ResourceAdapter<TemplateMinigameEntry> = {
  category: "minigames",
  providesKinds: ["minigame"],
  consumesKinds: ["tag", "customField", "flow"],
  deferredKinds: ["flow"],
  trackedKind: "minigame",
  folderTypes: [],
  // The texts may link to a tool installed after it (or to the minigame itself).
  rewritesLinksInPatch: true,
  minFormatVersion: 3,
  sync: updateNotSupported("minigames"),

  async stage(
    ctx: TemplateStageContext,
    entries: readonly TemplateMinigameEntry[],
  ): Promise<Map<string, StagedObject>> {
    return await stageToolImages(
      ctx,
      entries.flatMap(imageSlots),
      MINIGAME_IMAGE_SKIPPED,
    )
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateMinigameEntry[],
  ): Promise<PatchTask[]> {
    // Links follow the copies once every tool exists, flows once flows do: one
    // Phase-2 write per minigame covers both.
    const patcher = createLinkRewritePatcher<LinkedMinigameBlocks>("minigames")
    for (const entry of entries) {
      const prepared = prepareMinigame(ctx, entry)
      const created = await insertCopyNamed(ctx, {
        category: "minigames",
        constraint: "Minigame_workspaceId_name_key",
        entry,
        nameRules: { style: "dash", maxLength: MINIGAME_NAME_MAX_LENGTH },
        findTaken: (tx, name) =>
          tx.query.minigameModel.findMany({
            where: { workspaceId: ctx.workspaceId, name },
            columns: { name: true },
          }),
        insert: (tx, name) =>
          minigameService.insertInTx(
            tx,
            insertValuesOf(ctx.workspaceId, entry, prepared, name),
          ),
      })
      if (!created) {
        continue
      }
      if (new Date(entry.generalSettings.playedAtTo) <= new Date()) {
        ctx.warn({
          category: "minigames",
          entityKind: "scheduleExpired",
          path: `minigames.${entry.sourceId}.generalSettings.playedAtTo`,
          value: entry.generalSettings.playedAtTo,
        })
      }
      recordCopy(ctx, {
        category: "minigames",
        resourceKind: "minigame",
        idMapKind: "minigame",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
      deferMinigamePatch(patcher, entry, created)
    }
    return patcher.tasks()
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.minigameModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.minigameModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
      })
      const entries = rows.map(
        (row): TemplateMinigameEntry => ({
          sourceId: row.id,
          name: row.name,
          type: row.type,
          enabled: row.enabled,
          generalSettings: row.generalSettings,
          appearance: row.appearance,
          playerSettings: row.playerSettings,
          prizeSettings: row.prizeSettings,
          winningMessageSettings: row.winningMessageSettings,
          nonWinningMessageSettings: row.nonWinningMessageSettings,
        }),
      )
      return {
        entries,
        // A minigame that shares or follows up through a flow is useless without it.
        hardDependencies: entries.flatMap((entry) =>
          collectResourceDependencies({
            playerSettings: entry.playerSettings,
            winningMessageSettings: entry.winningMessageSettings,
            nonWinningMessageSettings: entry.nonWinningMessageSettings,
          }),
        ),
      }
    },
  }),
}
