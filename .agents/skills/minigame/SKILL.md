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

Builder feature in `apps/builder/src/features/minigames/`, business logic in `packages/business/src/minigame/`. No worker/queue code exists for minigames: everything runs synchronously in builder server actions/pages; outcome messages go through the pre-existing `chatQueue`/`integrationQueue` from inside `recordPlayAndDispatch`.

Flow: `create/edit minigame (builder) → {{minigame_play_token}} resolved into a shared link at message-send time → public /minigames?minigameId&token page → verify token → resolvePlayState → <type>PlayScreen → playMinigameAction → recordPlayAndDispatch (draw prize, decrement stock, send outcome message)`.

## The traps (read before editing)

1. **Playability is decided by ONE registry.** All five types are playable; the page and the action gate on `MINIGAME_PLAY_SCREENS` (`components/play/minigame-play-screen-registry.tsx`), not on a `=== "jackpot"` literal. A new type needs one entry there, one in `MINIGAME_PREVIEW_COMPONENTS` (`components/preview/minigame-preview-registry.tsx`), one in `MINIGAME_TYPES_ENABLED_FOR_CREATION` (`constants.ts`). `MinigameType` has no compiler-enforced fan-out (unlike `ChannelType`, invariant #3), so grep for stray `=== "jackpot"` / `minigameTypes.enum.jackpot` literals first — a miss fails silently (wrong UI, or a 403 that looks like a bug).

2. **Concurrency-critical code lives in `minigame-contact-service.ts` — read the `reliability-concurrency` skill first.** `drawPrize`, `resolvePlayState`, and `MinigameService.update`'s prize-quantity reconciliation depend on `SELECT ... FOR UPDATE` taken **inside** the caller's transaction, plus `insert().onConflictDoNothing()` for the first-play race on `MinigameContact_minigameId_contactId_key`. Never replace with check-then-write. `recordPlayAndDispatch` sends the outcome message **outside** the transaction (fire-and-forget, `.catch(() => {})`) so a failed send never rolls back a recorded play — don't move it inside.

3. **No probability redistribution when a prize sells out.** `drawPrize` filters out `quantity <= 0` prizes but does not rescale remaining `winRate`s; the share silently becomes lose-rate. Intentional and tested (`resolve-minigame-prize.test.ts` sold-out case) — check that test before "fixing".

4. **`MinigamePrizeSettings` must sum to exactly 100%.** `isMinigameProbabilityTotalValid` (partials file) uses integer-cents rounding (`Math.round(total*100) === 10_000`) to avoid float drift; the Zod `.refine()` and the builder's prize-list editor both call it — don't reimplement.

5. **`MinigamePlay.prizeName` is a denormalized snapshot, not a live join.** `prizeId` is a plain `text` column, not an FK (prizes live in `Minigame.prizeSettings` jsonb). History shows the prize *at play time*; don't add a join.

6. **`minigameService.update` quantity reconciliation only protects the same prize `id`** across load-then-save (submitted quantity vs client-captured `originalPrizeQuantities`; if unchanged, the current, possibly play-decremented, DB value wins). Delete + re-add (new `createId()`) has no cross-id reconciliation — the old decremented stock is dropped.

7. **Referral lock order is ONE: `player row → Minigame row`. Never fold the referral grant into the transaction that creates the invitee's row** (ABBA deadlock vs the referrer's own play). `creditSharedLinkReferral` calls `resolveOpenerPlayState` first, then `grantReferralBonus` in its own short transaction (crash window can only under-credit). Easy-to-break invariants (full text in [references/referral-and-play-token.md](references/referral-and-play-token.md)): `resolvePlayState` returns `{ state, created }` and `created` is the whole qualification test; the cap lives inside the grant UPDATE's `WHERE` (`lt(sharesCount, cap)`); the grant self-assigns `updatedAt: sql`${col}`` to defeat `$onUpdate`; `referrerContactId` is stamped only on the INSERT path; under `resetPolicy: "never"` move `sharesCount` and `remaining` together (`deriveRemaining`); read `playerSettings.maxSharesPerPerson`/`sharingFlowId`/`sharingNodeId` as `?? 0` / `?? null` (legacy rows lack them); `handleResetPolicyChange` must carry every shared `playerSettings` field (rebuild lives in `lib/player-settings.ts` behind a unit test — typecheck won't catch omissions).

8. **`{{minigame_play_token}}` is minted at message/broadcast-send time**, 24h TTL (`DEFAULT_TOKEN_TTL_MS` in `minigame-play-token.ts`). An old link fails `verifyMinigamePlayToken` and shows the generic "forbidden" notice (no "link expired" UX). Messenger utility-template URL buttons can't hold a named variable: use a positional `{{1}}` suffix (`createMessengerMessageTemplateRequest`, `suggestMessengerUrlSuffixVariable`, `normalizeMessengerTokenUrl`); only `/minigames?...token=` or `/mini-apps?...token=` with the token **last** and no other variable is accepted. The worker stores the unresolved `{{…_token}}` (`maskTokenButtonParams`), never the signed token. Full text in [references/referral-and-play-token.md](references/referral-and-play-token.md).

9. **`minigameService.findUnscoped(id)` is the only workspace-unscoped lookup**, because `/minigames` is a public route (`PUBLIC_ROUTES` in `lib/public-routes.ts`, no auth). Every call site (`app/minigames/page.tsx`, `play-minigame.action.ts`) re-checks `payload.workspaceId === minigame.workspaceId` from the verified token. New public entry points must use plain `actionClient` (not `workspaceActionClient`) and repeat token verification and the workspace match — no shared middleware does it.

## i18n

Namespace `minigames.*` in `apps/builder/messages/en.json`; update all locale files under `apps/builder/messages/` (19 translated locales + `en.json`), not just English.

## Verify

```bash
pnpm --filter @chatbotx.io/business vitest run __tests__/minigame-service-update.test.ts __tests__/resolve-minigame-prize.test.ts
pnpm --filter @chatbotx.io/encryption vitest run __tests__/minigame-play-token.test.ts
pnpm --filter builder check-types
pnpm lint
```

No automated test covers the public play page/action or the builder CRUD UI — verify manually: create a jackpot minigame, open the public `/minigames?minigameId=...&token=...` link, play until draws run out, confirm the builder history table reflects the plays.

## References

- [references/file-map.md](references/file-map.md) — where every table, service, token, share-link, page, action, preview, and test lives. Read to locate code.
- [references/data-flow.md](references/data-flow.md) — the play flow and the referral (share) loop step by step.
- [references/referral-and-play-token.md](references/referral-and-play-token.md) — full text of traps 7 and 8. Read before touching referral grants or play-token/URL-button handling.
- [references/new-type-recipe.md](references/new-type-recipe.md) — step list for adding gameplay for a new minigame type.
