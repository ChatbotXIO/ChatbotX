/**
 * The cache tag of one Page's AI hand-over settings. Kept apart from the service so
 * the inbox service (which the settings service itself depends on) can drop the
 * entry when it connects or disconnects a Page without a circular import.
 */
export const aiHandoverSettingsCacheTag = (inboxId: string): string =>
  `ai-handover-settings:${inboxId}`
