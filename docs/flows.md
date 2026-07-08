# Flow versions

This document describes the flow editor data model and the version lifecycle used by
the builder. It is the reference for draft editing, publishing, restoring older
versions, and reverting a draft back to the current published content.

## Tables

| Table | File | Role |
|---|---|---|
| `flowModel` | [`packages/database/src/schema/flow.ts`](../packages/database/src/schema/flow.ts) | Flow metadata and version pointers (`currentVersionId`, `draftVersionId`). |
| `flowVersionModel` | [`packages/database/src/schema/flow-version.ts`](../packages/database/src/schema/flow-version.ts) | Version payload (`nodes`, `edges`, `startNodeId`) plus lifecycle flags (`isDraft`, `isLatest`). |

## Invariants

- Exactly one draft row exists per flow: `flowVersionModel.isDraft = true`.
- At most one published row is current: `flowVersionModel.isDraft = false` and
  `flowVersionModel.isLatest = true`.
- `flowModel.currentVersionId` points to the current published version when one exists.
- Published rows are immutable snapshots. Editing only mutates the draft row.

## Lifecycle

| Operation | Code path | Behavior |
|---|---|---|
| Create | `createFlowAction` | Inserts the flow and a single draft version with a default start node. No published version exists yet. |
| Edit / autosave | `updateDraftFlowVersionAction` | Overwrites the draft row's `nodes` and `edges` from the canvas. |
| Publish | `publishFlowAction` | Copies the current draft content into a new published snapshot, marks it `isLatest`, and updates `currentVersionId`. |
| Restore older version | `flowVersionService.restore()` | Marks the chosen version as current published, updates `currentVersionId`, and copies that version's content into the draft row. |
| Revert draft to published | `flowVersionService.revertDraftToPublished()` | Copies the current published version's `nodes`, `edges`, and `startNodeId` back into the draft row without changing `currentVersionId` or the published pointer. |

## Cache

Published versions are cached under `flows:${flowId}:versions` via `withCache`
in [`packages/business/src/flow-version/service.ts`](../packages/business/src/flow-version/service.ts).

- `restore()` invalidates the versions cache because the published list changes.
- `publishFlowAction` invalidates the versions cache because it creates a new published snapshot.
- `revertDraftToPublished()` does not invalidate the versions cache because the published list does not change.

## Draft vs published equality

The flow editor decides whether the toolbar action can be used by comparing the draft
content to the current published content at page load. The page loads all versions,
finds the draft row and the current published row, and compares their serialized
`nodes`/`edges` using [`serializeFlowContent`](../apps/builder/src/features/flows/flow-version-content.ts).

That comparison is computed once when the page renders. After the user makes an edit,
the toolbar becomes enabled immediately (no reload needed). It also disables again
without a reload after a successful revert or restore, since the canvas content once
again equals the published content.

## Notes

- The canvas reset path used by restore and revert clears undo/redo history.
- The revert action is destructive from the user's perspective because it discards
  local draft work, so the builder shows a confirmation dialog before executing it.
