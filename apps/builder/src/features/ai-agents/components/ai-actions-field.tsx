"use client"

import type {
  AIAgentAction,
  AIAgentActionRule,
  AIAgentActionType,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import type { CreateAIAgentRequest } from "../schema/action"
import { ActionPromptPopover } from "./action-prompt-popover"

export type AIAgentActionOptions = {
  admins: Array<{ label: string; value: string }>
  customFields: Array<{ label: string; type: string; value: string }>
  flows: Array<{ label: string; value: string }>
  inboxTeams: Array<{ label: string; value: string }>
  tags: Array<{ label: string; value: string }>
}

const scalarCustomFieldTypes = new Set([
  "shortText",
  "longText",
  "email",
  "phoneNumber",
  "number",
  "date",
  "datetime",
  "boolean",
])

const actionLabelKey = {
  send_flow: "actionTypes.sendFlow",
  assign_conversation: "actionTypes.assignConversation",
  remove_assignment: "actionTypes.removeAssignment",
  transfer_to_human: "actionTypes.transferToHuman",
  add_tag: "actionTypes.addTag",
  remove_tag: "actionTypes.removeTag",
  set_custom_field: "actionTypes.setCustomField",
  clear_custom_field: "actionTypes.clearCustomField",
  mark_follow_up: "actionTypes.markFollowUp",
  remove_follow_up: "actionTypes.removeFollowUp",
  transfer_to_bot: "actionTypes.transferToBot",
  archive: "actionTypes.archive",
  block_contact: "actionTypes.blockContact",
} as const satisfies Record<AIAgentActionType, string>

const actionTypes = Object.keys(actionLabelKey) as AIAgentActionType[]

const createId = () => crypto.randomUUID()

function actionDefault(type: AIAgentActionType) {
  const id = createId()
  switch (type) {
    case "send_flow":
      return { id, type, flowId: "" }
    case "assign_conversation":
      return { id, type, assignedId: "" }
    case "add_tag":
    case "remove_tag":
      return { id, type, tagId: "" }
    case "set_custom_field":
    case "clear_custom_field":
      return { id, type, customFieldId: "" }
    default:
      return { id, type }
  }
}

function duplicateAction(action: AIAgentAction): AIAgentAction {
  switch (action.type) {
    case "send_flow":
      return { ...action, id: createId() }
    case "assign_conversation":
      return { ...action, id: createId() }
    case "add_tag":
    case "remove_tag":
      return { ...action, id: createId() }
    case "set_custom_field":
    case "clear_custom_field":
      return { ...action, id: createId() }
    default:
      return { ...action, id: createId() }
  }
}

function duplicateRule(rule: AIAgentActionRule): AIAgentActionRule {
  return {
    ...rule,
    id: createId(),
    actions: rule.actions.map(duplicateAction),
  }
}

export function normalizeAIAgentActionRulesForForm(
  rules: AIAgentActionRule[],
): AIAgentActionRule[] {
  return rules.map((rule) => ({
    ...rule,
    actions: rule.actions.map((action) =>
      action.type === "assign_conversation" && "adminId" in action
        ? {
            id: action.id,
            type: action.type,
            assignedId: `u_${action.adminId}`,
          }
        : action,
    ),
  }))
}

export function AIActionsField({ options }: { options: AIAgentActionOptions }) {
  const t = useTranslations("aiAgentActions")
  const { control, getValues } = useFormContext<CreateAIAgentRequest>()
  const { fields, append, remove } = useFieldArray({
    control,
    keyName: "fieldKey",
    name: "actionRules",
  })
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>()

  const scalarFields = options.customFields.filter((field) =>
    scalarCustomFieldTypes.has(field.type),
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-sm">{t("title")}</div>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("description")}
          </p>
        </div>
        <ActionPromptPopover />
      </div>
      <Accordion
        onValueChange={(value) =>
          setExpandedRuleId(typeof value[0] === "string" ? value[0] : null)
        }
        value={[
          expandedRuleId === undefined
            ? (fields.at(-1)?.id ?? "")
            : (expandedRuleId ?? ""),
        ].filter(Boolean)}
      >
        {fields.map((field, ruleIndex) => (
          <AIAgentActionRuleEditor
            key={field.fieldKey}
            onDuplicate={() => {
              const rule = getValues(`actionRules.${ruleIndex}`)
              if (rule) {
                const duplicate = duplicateRule(rule)
                append(duplicate)
                setExpandedRuleId(duplicate.id)
              }
            }}
            onRemove={() => remove(ruleIndex)}
            options={{ ...options, customFields: scalarFields }}
            ruleId={field.id}
            ruleIndex={ruleIndex}
          />
        ))}
      </Accordion>
      <Button
        className="self-center"
        disabled={fields.length >= 20}
        onClick={() => {
          const rule = {
            id: createId(),
            when: "",
            actions: [actionDefault("send_flow")],
          }
          append(rule)
          setExpandedRuleId(rule.id)
        }}
        size="sm"
        type="button"
        variant="default"
      >
        + {t("addRule")}
      </Button>
    </section>
  )
}

function AIAgentActionRuleEditor({
  ruleIndex,
  options,
  onDuplicate,
  onRemove,
  ruleId,
}: {
  ruleIndex: number
  ruleId: string
  options: AIAgentActionOptions
  onDuplicate: () => void
  onRemove: () => void
}) {
  const t = useTranslations("aiAgentActions")
  const tGlobal = useTranslations()
  const { clearErrors, control } = useFormContext<CreateAIAgentRequest>()
  const when = useWatch({
    control,
    name: `actionRules.${ruleIndex}.when`,
  })
  const { fields, append, move, remove, update } = useFieldArray({
    control,
    keyName: "fieldKey",
    name: `actionRules.${ruleIndex}.actions`,
  })

  return (
    <AccordionItem className="rounded-md border px-3" value={ruleId}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <AccordionTrigger
            className="py-3 hover:no-underline"
            data-testid={`ai-action-rule-trigger-${ruleIndex}`}
          >
            <span className="truncate">
              {when || tGlobal("condition.valuePlaceholder")}
            </span>
          </AccordionTrigger>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label={t("duplicateRule")}
            onClick={onDuplicate}
            size="icon"
            type="button"
            variant="ghost"
          >
            <CopyIcon aria-hidden className="size-4" />
          </Button>
          <Button
            aria-label={t("removeRule")}
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      <AccordionContent className="flex flex-col gap-4 border-t pt-4 pb-3">
        <InputField
          formItemClassName="[&>label]:font-semibold"
          label={t("when")}
          name={`actionRules.${ruleIndex}.when`}
          placeholder={t("whenPlaceholder")}
          required
        />
        <div className="font-semibold text-sm">{t("whatShouldAIDo")}</div>
        {fields.map((action, actionIndex) => (
          <AIAgentActionEditor
            actionIndex={actionIndex}
            canMoveEarlier={actionIndex > 0}
            canMoveLater={actionIndex < fields.length - 1}
            key={action.fieldKey}
            onMoveEarlier={() => move(actionIndex, actionIndex - 1)}
            onMoveLater={() => move(actionIndex, actionIndex + 1)}
            onRemove={() => remove(actionIndex)}
            onTypeChange={(type) => {
              update(actionIndex, actionDefault(type))
              clearErrors(`actionRules.${ruleIndex}.actions.${actionIndex}`)
            }}
            options={options}
            ruleIndex={ruleIndex}
          />
        ))}
        <Button
          className="w-fit px-0 text-primary hover:text-primary"
          disabled={fields.length >= 15}
          onClick={() => append(actionDefault("send_flow"))}
          size="sm"
          type="button"
          variant="ghost"
        >
          + {t("addAction")}
        </Button>
      </AccordionContent>
    </AccordionItem>
  )
}

function AIAgentActionEditor({
  ruleIndex,
  actionIndex,
  canMoveEarlier,
  canMoveLater,
  onMoveEarlier,
  onMoveLater,
  onTypeChange,
  options,
  onRemove,
}: {
  actionIndex: number
  canMoveEarlier: boolean
  canMoveLater: boolean
  onMoveEarlier: () => void
  onMoveLater: () => void
  onRemove: () => void
  onTypeChange: (type: AIAgentActionType) => void
  options: AIAgentActionOptions
  ruleIndex: number
}) {
  const t = useTranslations("aiAgentActions")
  const tGlobal = useTranslations()
  const { control } = useFormContext<CreateAIAgentRequest>()
  const base = `actionRules.${ruleIndex}.actions.${actionIndex}` as const
  const type = useWatch({ control, name: `${base}.type` }) as AIAgentActionType
  const selectOptions = actionTypes.map((value) => ({
    label: t(actionLabelKey[value]),
    value,
  }))

  return (
    <div className="flex flex-col gap-3 rounded border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">
          {t("action", { number: actionIndex + 1 })}
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label={t("moveDown")}
            disabled={!canMoveLater}
            onClick={onMoveLater}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDownIcon aria-hidden className="size-4" />
          </Button>
          <Button
            aria-label={t("moveUp")}
            disabled={!canMoveEarlier}
            onClick={onMoveEarlier}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUpIcon aria-hidden className="size-4" />
          </Button>
          <Button
            aria-label={t("removeAction")}
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      <SelectField
        aria-label={t("actionType")}
        formItemClassName="w-full"
        name={`${base}.type`}
        onValueChange={(value) => {
          if (value) {
            onTypeChange(value as AIAgentActionType)
          }
        }}
        options={selectOptions}
        required
      />
      {type === "send_flow" && (
        <SelectField
          formItemClassName="w-full"
          label={t("flow")}
          name={`${base}.flowId`}
          options={options.flows}
          required
        />
      )}
      {type === "assign_conversation" && (
        <ComboboxField
          emptyText={tGlobal("actions.noRecordFound")}
          formItemClassName="w-full"
          label={tGlobal("fields.assignedId.label")}
          name={`${base}.assignedId`}
          options={[
            {
              label: tGlobal("admins.title"),
              value: "admins",
              children: options.admins.map((admin) => ({
                ...admin,
                value: `u_${admin.value}`,
              })),
            },
            {
              label: tGlobal("inboxTeams.title"),
              value: "inbox-teams",
              children: options.inboxTeams.map((team) => ({
                ...team,
                value: `t_${team.value}`,
              })),
            },
          ]}
          placeholder={tGlobal("actions.pleaseSelect")}
          required
        />
      )}
      {(type === "add_tag" || type === "remove_tag") && (
        <SelectField
          formItemClassName="w-full"
          label={t("tag")}
          name={`${base}.tagId`}
          options={options.tags}
          required
        />
      )}
      {(type === "set_custom_field" || type === "clear_custom_field") && (
        <SelectField
          formItemClassName="w-full"
          label={t("customField")}
          name={`${base}.customFieldId`}
          options={options.customFields}
          required
        />
      )}
    </div>
  )
}
