import { cn } from "@chatbotx.io/ui/lib/utils"
import { readString } from "../../lib/props"
import { SimpleMarkdown } from "../simple-markdown"
import type { NodeView } from "./context"

const fontWeightClass: Record<string, string> = {
  bold: "font-bold",
  italic: "italic",
  bold_italic: "font-bold italic",
  normal: "",
}

export function TextHeadingView({ view }: { view: NodeView }) {
  return (
    <h2 className="font-bold text-[#111b21] text-[20px]">
      {view.text("text")}
    </h2>
  )
}

export function TextSubheadingView({ view }: { view: NodeView }) {
  return (
    <h3 className="font-semibold text-[#111b21] text-[17px]">
      {view.text("text")}
    </h3>
  )
}

/** TextBody and TextCaption: plain or markdown text with a font style. */
export function TextBodyView({ view }: { view: NodeView }) {
  const { node, props } = view
  const className = cn(
    node.type === "TextBody"
      ? "text-[#111b21] text-[15px]"
      : "text-[#667781] text-[13px]",
    fontWeightClass[readString(props["font-weight"])],
    props.strikethrough === true && "line-through",
  )
  return props.markdown === true ? (
    <div className={className}>
      <SimpleMarkdown source={view.text("text")} />
    </div>
  ) : (
    <p className={cn("whitespace-pre-wrap", className)}>{view.text("text")}</p>
  )
}

export function RichTextView({ view }: { view: NodeView }) {
  return (
    <div className="text-[#111b21] text-[15px]">
      <SimpleMarkdown source={view.text("text")} />
    </div>
  )
}
