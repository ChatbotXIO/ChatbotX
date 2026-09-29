import type { CommentAutomationType } from "@chatbotx.io/database/partials"
import { scanInstagramComments } from "./scan-instagram"
import { scanMessengerComments } from "./scan-messenger"
import { scanThreadsComments } from "./scan-threads"
import { scanTiktokComments } from "./scan-tiktok"
import type { ScanCommentsProps, ScannedComment } from "./types"

/** The post's recent comments on the automation's channel, webhook-shaped. */
export function scanPostComments(
  props: ScanCommentsProps & { type: CommentAutomationType },
): Promise<ScannedComment[]> {
  switch (props.type) {
    case "messenger":
      return scanMessengerComments(props)
    case "instagram":
    case "instagramFacebook":
      return scanInstagramComments({ ...props, type: props.type })
    case "threads":
      return scanThreadsComments(props)
    case "tiktok":
      return scanTiktokComments(props)
    default: {
      const unsupported: never = props.type
      throw new Error(`Unsupported comment automation type: ${unsupported}`)
    }
  }
}
