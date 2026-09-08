/**
 * next-intl message keys are untyped in this app (no `AppConfig` augmentation
 * — `en.d.json.ts` is gitignored and unreferenced), so a "message key" is
 * just a plain string here. `connect-channel-registry.test.ts` pins every
 * key referenced from the tables in this feature against `messages/en.json`
 * so a typo or a renamed key still fails loudly, without needing a type.
 */
export type MessageKey = string
