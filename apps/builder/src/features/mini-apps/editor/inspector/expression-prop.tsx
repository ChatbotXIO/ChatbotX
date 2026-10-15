// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
"use client"

import { collectInputNames } from "@chatbotx.io/mini-app"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { useTranslations } from "next-intl"
import { readString } from "../../lib/props"
import { useMiniAppEditor } from "../editor-context"
import { FieldRow, useInspector } from "./field-row"

/** Expression input for If/Switch with one-click field references. */
export function ExpressionProp({
  propKey,
  screenKey,
}: {
  propKey: "condition" | "value"
  screenKey: string
}) {
  const t = useTranslations("miniApps.inspector")
  const { props, setProp } = useInspector()
  const screens = useMiniAppEditor((state) => state.definition.screens)
  const value = readString(props[propKey])
  const references = screens.flatMap((screen) =>
    collectInputNames(screen).map((name) =>
      screen.key === screenKey
        ? `\${form.${name}}`
        : `\${screen.${screen.id}.form.${name}}`,
    ),
  )
  return (
    <FieldRow
      hint={
        propKey === "condition"
          ? t("conditionHint", {
              example: "${form.age} >= 18 && ${form.agree}",
            })
          : t("switchValueHint")
      }
      propKey={propKey}
    >
      <div className="flex flex-col gap-1.5">
        <Textarea
          className="min-h-16 font-mono text-xs"
          onChange={(event) => setProp(propKey, event.target.value)}
          placeholder={
            propKey === "condition" ? "${form.age} >= 18" : "${form.plan}"
          }
          value={value}
        />
        {references.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {references.map((reference) => (
              <button
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-primary/10"
                key={reference}
                onClick={() =>
                  setProp(propKey, value ? `${value} ${reference}` : reference)
                }
                type="button"
              >
                {reference}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FieldRow>
  )
}
