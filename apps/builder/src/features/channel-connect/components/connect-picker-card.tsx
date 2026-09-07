/**
 * Widths of the two connect surfaces. Both are LITERAL class strings on
 * purpose: Tailwind only emits CSS for class names it can see verbatim in
 * source, so a class built by string interpolation (a breakpoint prefix joined to a variable) is never generated — that exact
 * mistake shipped once and left the status dialog with no max-width at all.
 * Keep every class here spelled out, and keep these two constants the only
 * place a connect-surface width is written.
 *
 * Caps, not widths: paired with `w-full` (the card) or the dialog's own
 * `w-[calc(100%-2rem)]`, both still fit 320-375px, where the builder is used
 * (PR #970).
 */

/** The picker card (Messenger pages, Instagram accounts, WhatsApp numbers): rows carry a name, a secondary line and two switches, so it gets the wider cap. */
export const CONNECT_PICKER_CARD_CLASS = "mx-auto mt-40 w-full max-w-2xl"

/**
 * The status dialog: a regular modal width, and deliberately the SAME class
 * the dialog shipped with before the picker grew — `sm:max-w-lg` is already
 * in every built stylesheet, so a stale CSS bundle in front of a dev tunnel
 * still renders it correctly, whereas a brand-new class does not exist in
 * that bundle at all. `sm:` because a mobile dialog is full-bleed by design.
 */
export const CONNECT_DIALOG_WIDTH_CLASS = "sm:max-w-lg"
