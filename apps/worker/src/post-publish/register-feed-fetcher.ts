import {
  isFeedAiModelUsable,
  writeFeedPost,
} from "@chatbotx.io/ai/feed-post-writer"
import {
  registerFeedAiModelChecker,
  registerFeedArticleImageFinder,
  registerFeedFetcher,
  registerFeedImageImporter,
  registerFeedPostWriter,
} from "@chatbotx.io/business"
import { findFeedArticleImage } from "@chatbotx.io/business/net/feed-article-image"
import { fetchFeed } from "@chatbotx.io/business/net/feed-fetch"
import { importFeedImage } from "@chatbotx.io/business/net/feed-image-import"

// The worker fetches feeds with the pinned, size- and time-bounded Node client;
// importing this module registers it.
registerFeedFetcher(fetchFeed)
// Pictures are imported through the SSRF-pinned client and re-encoded with sharp (Node-only).
registerFeedImageImporter(importFeedImage)
// An item with no picture may read its article page for og:image (feed setting `fetchArticleImage`), through the same pinned client.
registerFeedArticleImageFinder(findFeedArticleImage)
registerFeedPostWriter(writeFeedPost)
registerFeedAiModelChecker(isFeedAiModelUsable)
