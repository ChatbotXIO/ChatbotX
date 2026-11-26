import { useTranslations } from "next-intl"
import {
  type PostAuthorKind,
  type PostAuthorSource,
  resolvePostAuthor,
} from "../lib/post-author"

type PostAuthorLabelProps = {
  kind: PostAuthorKind
}

/** A small muted tag that says the shown name is the owner, not a person. */
function PostAuthorLabel({ kind }: PostAuthorLabelProps) {
  const t = useTranslations()
  if (kind === "creator") {
    return null
  }
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
      {kind === "page"
        ? t("posts.detail.ownerPage")
        : t("posts.detail.ownerAccount")}
    </span>
  )
}

type PostAuthorValueProps = {
  post: PostAuthorSource
}

/** The creator, or the owner page or account with its label; never empty. */
export function PostAuthorValue({ post }: PostAuthorValueProps) {
  const author = resolvePostAuthor(post)
  return (
    <>
      <span className="min-w-0 truncate" title={author.name}>
        {author.name}
      </span>
      <PostAuthorLabel kind={author.kind} />
    </>
  )
}
