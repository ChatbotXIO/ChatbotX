## Comment Handler Pattern

Channels with comments (messenger, instagram, instagram-facebook, tiktok, threads) expose a `comment` channel alongside `message`. Every one of them uses the same flat layout — one file per role, no folder that holds only an `index.ts`:

```
handlers/
  comment/
    index.ts                    ← only aggregates commentHandlers, no logic
    comment.ts                  ← editComment, deleteComment, likeComment, hideComment
    outgoing-comment.ts         ← sendComment (public reply)
    outgoing-private-reply.ts   ← sendPrivateReply (DM to the commenter)
  message/
    index.ts                    ← only aggregates messageHandlers, no logic
    incoming-message.ts         ← receiveMessage
    media-urls.ts               ← getMessageMediaUrls (Meta channels)
    outgoing-message/
      index.ts                  ← sendMessage, sendFlowStep
      send-*.ts                 ← one converter per flow step type
```

Only include the files for slots the channel supports. A helper shared by more than one handler (e.g. tiktok `requirePostId`) goes in `lib/`, never in one handler file imported by another.

**`index.ts`:**

```typescript
import { deleteComment, editComment, hideComment, likeComment } from "./comment"
import { sendComment } from "./outgoing-comment"
import { sendPrivateReply } from "./outgoing-private-reply"

export const commentHandlers = {
  sendComment,
  sendPrivateReply,
  editComment,
  deleteComment,
  likeComment,
  hideComment,
}
```

**`comment.ts`** — wrap API calls, catch errors, re-throw as `mapToChannelError(error)`. Type every handler as `CommentHandlers<Auth>["<slot>"]`.

**API naming** — functions in `apis/` are named `<verb><Resource>` without the channel name (`replyToComment`, `hideComment`, `sendMessage`, `uploadAttachment`); the package name already says which channel. When an API function shares a name with the handler that calls it, alias the import (`hideComment as hideCommentApi`) — Biome forbids namespace imports.

**`sendComment`** — requires `message.contentAttributes.replyToCommentId` (string); throw `ChannelError(PAYLOAD_INVALID)` if missing.

**`editComment`** — if the platform does not support editing comments (e.g. Facebook/Instagram), resolve immediately with no-op and log a warning.

**Webhook routing** — comment events arrive as `changes` entries with `field === "comments"`. Parse with a typed Zod schema, then `queue.add("incomingComment", { type: "incomingComment", data: { commentData: {...} } })`.
