# Adding gameplay for a new minigame type

1. Add the type's UI (preview, form fields, play screen) — mirror the jackpot components under `components/preview/` and `components/play/`.
2. Flip `MINIGAME_TYPES_ENABLED_FOR_CREATION` in `constants.ts` to include it.
3. Update the type gate in `play-minigame.action.ts` and `app/minigames/page.tsx` (trap #1 — grep for every `"jackpot"` literal, don't trust this list to be complete).
4. Register the new type's preview in `MINIGAME_PREVIEW_COMPONENTS` (`minigame-preview-registry.tsx:35`).
5. If the new type needs its own appearance/settings shape, extend the discriminated unions in `packages/database/src/partials/minigame.ts` rather than overloading the jackpot-shaped fields.
6. Add/extend tests mirroring `resolve-minigame-prize.test.ts` if draw logic changes.
