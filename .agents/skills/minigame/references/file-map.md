# Minigame file map

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
| Public play page (auth-bypassed) | `apps/builder/src/app/minigames/page.tsx`, registered in `PUBLIC_ROUTES` (`apps/builder/src/lib/public-routes.ts`) |
| Public play action | `apps/builder/src/features/minigames/actions/play-minigame.action.ts` (`actionClient`, NOT workspace-scoped) |
| Jackpot play screen (client, slot animation) | `apps/builder/src/features/minigames/components/play/jackpot-play-screen.tsx` |
| Jackpot SVG art + start button | `packages/minigame-ui/` (`JackpotMachineArt`, `JackpotStartButton`) |
| Admin/type-picker previews | `apps/builder/src/features/minigames/components/preview/` (`MinigamePreview` dispatches through the `MINIGAME_PREVIEW_COMPONENTS` registry in
`minigame-preview-registry.tsx:35`, falling back to `GenericMinigamePreview`; per-type previews
exist for jackpot, luckyWheel, gashapon, drawLots, scratchOff) |
| Default settings + type config | `apps/builder/src/features/minigames/constants.ts` |
| Tests | `packages/business/__tests__/{minigame-service-update,resolve-minigame-prize,minigame-referral-bonus,referral-ref-encoding}.test.ts`, `packages/encryption/__tests__/minigame-play-token.test.ts`, `apps/worker/__tests__/run-ref-minigame-share.test.ts`, `apps/builder/__tests__/minigame-{share-url,player-settings-reset-policy}.test.ts` |

No worker/queue code exists for minigames — grep confirms zero hits in `apps/worker`/`packages/worker-config`. Everything runs synchronously in builder server actions/pages; outcome messages are dispatched via the pre-existing `chatQueue`/`integrationQueue` from inside `recordPlayAndDispatch`, not a dedicated queue.
