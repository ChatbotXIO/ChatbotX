import {
  instagramFacebookPublisher,
  instagramPublisher,
} from "@chatbotx.io/integration-instagram/publisher"
import { facebookPublisher } from "@chatbotx.io/integration-messenger/publisher"
import { threadsPublisher } from "@chatbotx.io/integration-threads/publisher"
import { tiktokPublisher } from "@chatbotx.io/integration-tiktok/publisher"
import type { SocialPublisherMap } from "@chatbotx.io/utils/social-publisher"

/**
 * The publishing function of each publisher key. Instagram has two: Instagram
 * Login (graph.instagram.com) and a Facebook Page connection (graph.facebook.com);
 * business picks one from the destination's credential. TikTok publishes videos
 * only (Content Posting API); its photo type stays disabled in the registry.
 */
export const socialPublishers: SocialPublisherMap = {
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  instagramFacebook: instagramFacebookPublisher,
  threads: threadsPublisher,
  tiktok: tiktokPublisher,
}
