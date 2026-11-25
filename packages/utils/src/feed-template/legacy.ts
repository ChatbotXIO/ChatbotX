const LEGACY_TOKEN = /\{(title|link|summary)\}/g
const LEGACY_PROBE = /\{(title|link|summary)\}/

/** True for a template written with the old single-brace tokens (`{title}`) and none of the new syntax. */
export const looksLikeLegacyTemplate = (template: string): boolean =>
  LEGACY_PROBE.test(template) && !template.includes("{{")

/** `{title}` -> `{{ title }}`; what the editor offers when an old template is opened. */
export const convertLegacyTemplate = (template: string): string =>
  template.replace(LEGACY_TOKEN, (_match, name: string) => `{{ ${name} }}`)
