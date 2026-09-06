---
name: minigame
description: >-
  Work on the Minigame tool — the Jackpot slot-machine game (and four
  scaffolded-but-unimplemented types: luckyWheel, gashapon, drawLots,
  scratchOff) that workspaces create, share a public play link for, and
  track plays/prizes for. Use when touching minigame CRUD, the type picker,
  prize/draw logic, the public play page or play token, the jackpot preview
  UI, or extending gameplay to a new minigame type. Read this BEFORE editing
  anything under `features/minigames`, `business/src/minigame`, or
  `minigame-play-token` to avoid the silent "only jackpot works" traps.
---

# Minigame (Jackpot)

## Where things live

| Concern | Path |
|---|---|
| DB tables (Minigame, MinigameContact, MinigamePlay) | `packages/database/src/schema/minigame{,-contact,-play}.ts` |
| Relations | `packages/database/src/relations/minigame{,-contact,-play}.ts`, wired into `relations/index.ts` |
| Zod partials (single source for all 6 jsonb settings columns) | `packages/database/src/partials/minigame.ts` |
| CRUD + prize-quantity reconciliation | `packages/business/src/minigame/service.ts` (`minigameService`) |
| Prize draw math | `packages/business/src/minigame/resolve-prize.ts` (`resolveMinigamePrize`) |
| Play state, draw, dispatch (concurrency-critical) | `packages/business/src/minigame/minigame-contact-service.ts` (`minigameContactService`) |
| Play token sign/verify (24h TTL) | `packages/encryption/src/minigame-play-token.ts` |
| `minigame-share` ref encode/decode | `packages/business/src/referral/utils.ts` (`RefConfig`) |
| Ref-capable channel list (which channels actually deliver a ref) | `packages/business/src/inbox/utils.ts` (`REF_CAPABLE_CHANNELS`, `canReceiveRef`) |
| Share-link builder (ref link for the player's own channel) | `apps/builder/src/features/minigames/lib/minigame-share.ts` |
| Share button (rendered once, in the play layout) | `apps/builder/src/features/minigames/components/play/minigame-share-button.tsx` |
| Sharing Node picker | `apps/builder/src/features/minigames/components/sharing-node-field.tsx` |
| Reset-policy rebuild (carries every shared `playerSettings` field) | `apps/builder/src/features/minigames/lib/player-settings.ts` |
| Ref handler that runs the Sharing Node + credits the referrer | `apps/worker/src/integration/handlers/ref.ts` (`minigame-share` branch) |
| `{{minigame_play_token}}` system variable | `packages/variables/src/utils.ts` (`systemFieldTypes.enum.minigame_play_token`), enum in `packages/database/src/partials/contact.ts` |
| Builder feature (admin CRUD, form, dialogs) | `apps/builder/src/features/minigames/` |
| Type picker dialog | `apps/builder/src/features/minigames/components/create-minigame-type-dialog.tsx` |
| Public play page (auth-bypassed) | `apps/builder/src/app/minigames/page.tsx`, registered in `apps/builder/src/proxy.ts` (`publicRoutes`) |
| Public play action | `apps/builder/src/features/minigames/actions/play-minigame.action.ts` (`actionClient`, NOT workspace-scoped) |
| Jackpot play screen (client, slot animation) | `apps/builder/src/features/minigames/components/play/jackpot-play-screen.tsx` |
| Jackpot SVG art + start button | `packages/minigame-ui/` (`JackpotMachineArt`, `JackpotStartButton`) |
| Admin/type-picker previews | `apps/builder/src/features/minigames/components/preview/` (`MinigamePreview` dispatches jackpot → `JackpotPreview`, else `GenericMinigamePreview`) |
| Default settings + type config | `apps/builder/src/features/minigames/constants.ts` |
| Tests | `packages/business/__tests__/{minigame-service-update,resolve-minigame-prize,minigame-referral-bonus,referral-ref-encoding}.test.ts`, `packages/encryption/__tests__/minigame-play-token.test.ts`, `apps/worker/__tests__/run-ref-minigame-share.test.ts`, `apps/builder/__tests__/minigame-{share-url,player-settings-reset-policy}.test.ts` |

No worker/queue code exists for minigames — grep confirms zero hits in `apps/worker`/`packages/worker-config`. Everything runs synchronously in builder server actions/pages; outcome messages are dispatched via the pre-existing `chatQueue`/`integrationQueue` from inside `recordPlayAndDispatch`, not a dedicated queue.

## Data flow in one line

`create/edit minigame (builder) → {{minigame_play_token}} resolved into a shared link at message-send time → public /minigames?minigameId&token page → verify token → resolvePlayState → <type>PlayScreen → playMinigameAction → recordPlayAndDispatch (draw prize, decrement stock, send outcome message)`.

Referral loop: `player taps Share (copies a ref link for the channel they are playing on, e.g. m.me/<pageId>?ref=mg_<minigameId>_<contactId>) → friend taps it, messages that channel → webhook extracts the ref → runRef's minigame-share branch reads playerSettings.sharingNodeId and enqueues sendFlow{flowId,nodeId} → creditSharedLinkReferral creates the invitee's MinigameContact with referrerContactId stamped; only if THAT call created the row does grantReferralBonus credit the referrer (+1 sharesCount, +1 remaining, capped)`.

## The traps (read before editing)

1. **Playability is decided by ONE registry — keep it that way.** All five types (jackpot, luckyWheel, gashapon, drawLots, scratchOff) are playable, and both the page and the action gate on `MINIGAME_PLAY_SCREENS` (`components/play/minigame-play-screen-registry.tsx`) rather than on a `=== "jackpot"` literal. Adding a type means adding one entry there, one entry in `MINIGAME_PREVIEW_SCREENS`, and one in `MINIGAME_TYPES_ENABLED_FOR_CREATION` (`constants.ts`). `MinigameType` has no compiler-enforced fan-out (unlike the `ChannelType` cascade, repo invariant #3), so before adding a type still grep for stray `=== "jackpot"` / `minigameTypes.enum.jackpot` literals — a missed one fails silently (wrong UI, or a 403 that looks like a bug).

2. **Concurrency-critical code lives in `minigame-contact-service.ts` — read `reliability-concurrency` skill before touching it.** `drawPrize`, `resolvePlayState`, and `MinigameService.update`'s prize-quantity reconciliation all depend on `SELECT ... FOR UPDATE` locks taken **inside** the caller's transaction, plus `insert().onConflictDoNothing()` for the first-play race on `MinigameContact_minigameId_contactId_key`. Do not replace these with an application-level check-then-write — that's exactly the race these patterns close. `recordPlayAndDispatch` deliberately sends the outcome message **outside** the transaction (fire-and-forget, `.catch(() => {})`) so a failed message send never rolls back an already-recorded play — don't move message dispatch inside the transaction "to be safe."

3. **No probability redistribution when a prize sells out.** `drawPrize` filters out prizes with `quantity <= 0` before drawing, but does not rescale the remaining `winRate`s — the excluded prize's share silently becomes extra lose-rate. This is intentional and tested (`resolve-minigame-prize.test.ts`'s sold-out case) — don't "fix" it by redistributing without checking that test first.

4. **`MinigamePrizeSettings` must sum to exactly 100%.** `isMinigameProbabilityTotalValid` (in the partials file) does integer-cents rounding (`Math.round(total*100) === 10_000`) specifically to avoid float drift; both the Zod `.refine()` and the builder's prize-list editor call this one helper — don't reimplement the sum check separately.

5. **`MinigamePlay.prizeName` is a denormalized snapshot, not a live join.** `prizeId` is a plain `text` column, not an FK — prizes live in `Minigame.prizeSettings` jsonb and can be edited/deleted after the fact. History intentionally shows what the prize was *at play time*; don't add a join to "fix" stale-looking names.

6. **`minigameService.update`'s quantity reconciliation only protects the same prize `id` across the load-then-save window** (compares submitted quantity against a client-captured `originalPrizeQuantities` baseline; if unchanged since load, the current — possibly play-decremented — DB value wins). Deleting a prize row in the form and adding a new one (new `createId()`) has no cross-id reconciliation — the old prize's decremented stock is simply dropped.

7. **The referral flow has ONE consistent lock order: `player row → Minigame row`. Do not fold the referral grant into the transaction that creates the invitee's row.** A share credits a *different* `MinigameContact` row (the referrer's) than the one being created. Granting inside that transaction makes its order `invitee row → Minigame → referrer row`, which deadlocks (ABBA) against a concurrent play by the referrer themselves, who holds their own row and waits on the Minigame row. So `creditSharedLinkReferral` calls `resolveOpenerPlayState` first, then `grantReferralBonus` in its own short transaction. The narrow crash window can only under-credit, never over-credit. Related invariants that are easy to break:
   - `resolvePlayState` returns `{ state, created }`. **`created` is the whole qualification test**: it means both "one bonus per invitee, ever" and "the invitee had never played this minigame". Never re-derive either from a separate read.
   - The cap lives **inside** the grant UPDATE's `WHERE` (`lt(sharesCount, cap)`), never as a read-then-write.
   - The grant self-assigns `updatedAt: sql`${col}`` to defeat `$onUpdate` — this table overloads `updatedAt` as *both* the `everyNDays` cycle marker and the admin table's `lastPlayedAt`.
   - `referrerContactId` is stamped **only on the INSERT path** of `resolvePlayState`.
   - Under `resetPolicy: "never"`, `remaining` is *derived* (`deriveRemaining`), so a bonus must move `sharesCount` and `remaining` together or the next `resolvePlayState` wipes it. Under `everyNDays`, unused bonus draws deliberately expire with the cycle while the cap stays lifetime.
   - `playerSettings.maxSharesPerPerson`, `sharingFlowId` and `sharingNodeId` are all missing entirely from legacy jsonb rows — always read them as `?? 0` / `?? null`. The drizzle `$type<>` lies about them being present.
   - `minigame-form.tsx`'s `handleResetPolicyChange` rebuilds the whole `playerSettings` union value, so **every** shared field has to be carried across. A narrower object literal still satisfies the branch type, so typecheck will NOT catch an omission — that is why the rebuild lives in `lib/player-settings.ts` behind a unit test.

8. **`{{minigame_play_token}}` is minted at message/broadcast-send time, not at click time**, with a 24h TTL (`DEFAULT_TOKEN_TTL_MS` in `minigame-play-token.ts`). An old saved/forwarded link fails `verifyMinigamePlayToken` and renders the same generic "forbidden" notice as an unauthorized request — there's no distinct "link expired" UX today.

9. **`minigameService.findUnscoped(id)` is the only workspace-unscoped lookup on the service** — it exists because `/minigames` is a public route (registered in `proxy.ts`'s `publicRoutes`, bypassing auth entirely). Every call site (`app/minigames/page.tsx`, `play-minigame.action.ts`) re-checks `payload.workspaceId === minigame.workspaceId` from the verified token immediately after calling it. Any new public entry point must use the plain `actionClient` (not `workspaceActionClient`, which assumes a session) and must repeat both the token verification and this workspace-match check — there is no shared middleware doing it for you.

## Adding gameplay for a new minigame type (recipe)

1. Add the type's UI (preview, form fields, play screen) — mirror the jackpot components under `components/preview/` and `components/play/`.
2. Flip `MINIGAME_TYPES_ENABLED_FOR_CREATION` in `constants.ts` to include it.
3. Update the type gate in `play-minigame.action.ts` and `app/minigames/page.tsx` (trap #1 — grep for every `"jackpot"` literal, don't trust this list to be complete).
4. Extend `MinigamePreview`'s dispatch to route to the new type's preview.
5. If the new type needs its own appearance/settings shape, extend the discriminated unions in `packages/database/src/partials/minigame.ts` rather than overloading the jackpot-shaped fields.
6. Add/extend tests mirroring `resolve-minigame-prize.test.ts` if draw logic changes.

## i18n

Namespace `minigames.*` in `apps/builder/messages/en.json`. This repo's invariant applies in full: update all locale files under `apps/builder/messages/` (19 translated locales + `en.json`), not just English — see the `minigames.*` keys added across all of them in the feature's introducing commit as the reference pattern.

## Verify

```bash
pnpm --filter @chatbotx.io/business vitest run __tests__/minigame-service-update.test.ts __tests__/resolve-minigame-prize.test.ts
pnpm --filter @chatbotx.io/encryption vitest run __tests__/minigame-play-token.test.ts
pnpm --filter builder check-types
pnpm lint
```

No automated test covers the public play page/action or the builder CRUD UI — verify those manually: create a jackpot minigame, open the public `/minigames?minigameId=...&token=...` link, play until draws run out, and confirm the history table in the builder reflects the plays.
