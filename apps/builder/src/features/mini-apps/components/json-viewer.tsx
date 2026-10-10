"use client"

import { json } from "@codemirror/lang-json"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"
import { useTheme } from "next-themes"

const EXTENSIONS = [json(), EditorView.lineWrapping]

/** Read-only JSON viewer; loaded with `next/dynamic` to keep CodeMirror out of the main bundle. */
export default function JsonViewer({
  value,
  height = "60vh",
}: {
  value: string
  height?: string
}) {
  const { resolvedTheme } = useTheme()
  return (
    <CodeMirror
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: false,
      }}
      className="overflow-hidden rounded-md border text-xs"
      editable={false}
      extensions={EXTENSIONS}
      height={height}
      readOnly
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      value={value}
    />
  )
}
