import {
  GOOGLE_ADS_CHANNEL_VALUES,
  type GoogleAdsChannel,
} from "@chatbotx.io/utils/google-click"

/**
 * The one channel the Google Ads statistics are filtered to, derived from the
 * Analytics dashboard's shared Channel filter.
 *
 * The statistics service filters by a single channel, so the shared selection
 * applies only when it is exactly one channel that Google conversions come
 * from; several channels, or a channel Google has no conversions for, show all
 * channels. `undefined` means "all channels".
 */
export function resolveGoogleStatsChannel(
  sharedChannels: readonly string[],
): GoogleAdsChannel | undefined {
  const [only] = sharedChannels
  if (sharedChannels.length !== 1) {
    return
  }
  return GOOGLE_ADS_CHANNEL_VALUES.find((channel) => channel === only)
}
