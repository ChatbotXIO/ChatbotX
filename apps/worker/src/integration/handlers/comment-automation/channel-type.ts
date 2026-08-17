/**
 * The channels a Facebook/Instagram comment automation can run on. Narrower
 * than the workspace-wide `ChannelType` (`@chatbotx.io/utils/channel`) on
 * purpose: `instagramFacebook` distinguishes Instagram-via-Facebook-Login from
 * Instagram Login for auth/send-endpoint dispatch here, while both collapse to
 * the single `"instagram"` `ChannelType` everywhere else (flow config, channel
 * picker, settings) since contacts and flows never see that distinction.
 */
export type CommentAutomationChannelType =
  | "messenger"
  | "instagram"
  | "instagramFacebook"
