import {
  MINI_APP_ACTION_KEY,
  type MiniAppNavigationItem,
  readMiniAppAction,
} from "@chatbotx.io/mini-app"
import { ChevronRightIcon } from "lucide-react"
import { toImageSrc } from "../../lib/image-src"
import { readArray } from "../../lib/props"
import type { NodeView } from "./context"

export function EmbeddedLinkView({ view }: { view: NodeView }) {
  return (
    <button
      className="self-start text-[#027eb5] text-[15px]"
      disabled={!view.interactive}
      onClick={view.trigger}
      type="button"
    >
      {view.text("text")}
    </button>
  )
}

function NavigationItemRow({
  item,
  view,
}: {
  item: Partial<MiniAppNavigationItem>
  view: NodeView
}) {
  const main = item["main-content"]
  const startSrc = toImageSrc(item.start?.image)
  const tags = readArray<string>(item.tags)
  const action = readMiniAppAction(item[MINI_APP_ACTION_KEY])
  return (
    <button
      className="flex items-center gap-3 px-3 py-2 text-start"
      disabled={!view.interactive}
      onClick={() => action && view.onAction?.(action)}
      type="button"
    >
      {startSrc ? (
        // biome-ignore lint/performance/noImgElement: inline base64 from Flow JSON
        <img
          alt={item.start?.["alt-text"] ?? ""}
          className="size-10 rounded object-cover"
          height={40}
          src={startSrc}
          width={40}
        />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-[#111b21] text-[15px]">
          {main?.title}
          {typeof item.badge === "string" ? (
            <span className="rounded bg-[#d9fdd3] px-1.5 text-[#008069] text-[11px]">
              {item.badge}
            </span>
          ) : null}
        </span>
        {main?.description ? (
          <span className="text-[#667781] text-[13px]">{main.description}</span>
        ) : null}
        {tags.length > 0 ? (
          <span className="flex gap-1">
            {tags.map((tag) => (
              <span
                className="rounded bg-[#f0f2f5] px-1.5 text-[#54656f] text-[11px]"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {item.end?.title ? (
        <span className="text-[#111b21] text-[14px]">{item.end.title}</span>
      ) : null}
      <ChevronRightIcon className="size-4 text-[#8696a0]" />
    </button>
  )
}

export function NavigationListView({ view }: { view: NodeView }) {
  const items = readArray<Partial<MiniAppNavigationItem>>(
    view.props["list-items"],
  )
  return (
    <div className="flex flex-col divide-y divide-[#e9edef] rounded-md border border-[#e9edef]">
      {items.map((item, index) => (
        <NavigationItemRow
          item={item}
          key={typeof item.id === "string" && item.id ? item.id : index}
          view={view}
        />
      ))}
    </div>
  )
}

export function FooterView({ view }: { view: NodeView }) {
  const { text } = view
  return (
    <div className="flex flex-col gap-1">
      <button
        className="w-full rounded-full bg-[#008069] py-2.5 font-medium text-[15px] text-white disabled:opacity-60"
        disabled={!view.interactive || view.props.enabled === false}
        onClick={view.trigger}
        type="button"
      >
        {view.label}
      </button>
      {text("center-caption") ||
      text("left-caption") ||
      text("right-caption") ? (
        <div className="flex justify-between text-[#667781] text-[12px]">
          <span>{text("left-caption")}</span>
          <span>{text("center-caption")}</span>
          <span>{text("right-caption")}</span>
        </div>
      ) : null}
    </div>
  )
}
