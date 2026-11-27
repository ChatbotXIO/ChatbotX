import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
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

/** The author's name, truncated, with the full name in a tooltip. */
function PostAuthorName({ name }: { name: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="min-w-0 max-w-full truncate" />}>
        {name}
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  )
}

/** The creator, or the owner page or account with its label; never empty. */
export function PostAuthorValue({ post }: PostAuthorValueProps) {
  const author = resolvePostAuthor(post)
  return (
    <>
      <PostAuthorName name={author.name} />
      <PostAuthorLabel kind={author.kind} />
    </>
  )
}

/** A table cell's author: the name on the first line, the owner tag under it. */
export function PostAuthorCell({ post }: PostAuthorValueProps) {
  const author = resolvePostAuthor(post)
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 text-sm">
      <PostAuthorName name={author.name} />
      <PostAuthorLabel kind={author.kind} />
    </div>
  )
}
