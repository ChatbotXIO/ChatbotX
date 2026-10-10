// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
"use client"
import {
  DISPLAY_TEXT_PROPS,
  findNode,
  MINI_APP_COMPONENTS,
  type MiniAppNode,
  type MiniAppValidationIssue,
} from "@chatbotx.io/mini-app"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"
import { componentLabelKey } from "../../lib/labels"
import { useIssueMessage } from "../../lib/use-issue-message"
import { useMiniAppEditor } from "../editor-context"
import { componentIcon } from "../palette"
import { AnswerReferenceField } from "./answer-reference-field"
import {
  ActionProp,
  CarouselImagesProp,
  ExpressionProp,
  ImageProp,
  NavigationItemsProp,
  OptionsProp,
  SwitchCasesProp,
} from "./complex-fields"
import { CustomFieldMapping } from "./custom-field-mapping"
import {
  BooleanProp,
  DateProp,
  EnumProp,
  InspectorContext,
  ListProp,
  MultiEnumProp,
  NumberProp,
  TextProp,
} from "./fields"

const VARIABLE_HINT_PARAMS = { open: "{{", button: "</>" }

function NodeFields({
  node,
  screenKey,
  screenId,
}: {
  screenId: string
  node: MiniAppNode
  screenKey: string
}) {
  const t = useTranslations("miniApps.inspector")
  const nameField = (
    <>
      <TextProp hint={t("nameHint")} mono propKey="name" />
      {MINI_APP_COMPONENTS[node.type].isInput ? (
        <AnswerReferenceField fieldKey={node.props.name} screenId={screenId} />
      ) : null}
    </>
  )
  const action = MINI_APP_COMPONENTS[node.type].actions

  const fieldsByType: Record<MiniAppNode["type"], () => ReactNode> = {
    TextHeading: () => <TextProp maxLength={80} propKey="text" />,
    TextSubheading: () => <TextProp maxLength={80} propKey="text" />,
    TextBody: () => (
      <>
        <TextProp
          hint={t("variablesHint", VARIABLE_HINT_PARAMS)}
          maxLength={4096}
          multiline
          propKey="text"
        />
        <EnumProp propKey="font-weight" />
        <BooleanProp propKey="strikethrough" />
        <BooleanProp propKey="markdown" />
      </>
    ),
    TextCaption: () => (
      <>
        <TextProp
          hint={t("variablesHint", VARIABLE_HINT_PARAMS)}
          maxLength={409}
          multiline
          propKey="text"
        />
        <EnumProp propKey="font-weight" />
        <BooleanProp propKey="strikethrough" />
        <BooleanProp propKey="markdown" />
      </>
    ),
    RichText: () => (
      <TextProp hint={t("markdownHint")} multiline propKey="text" />
    ),
    TextInput: () => (
      <>
        <TextProp maxLength={20} propKey="label" />
        {nameField}
        <EnumProp propKey="input-type" />
        <BooleanProp propKey="required" />
        <TextProp maxLength={80} propKey="helper-text" />
        <NumberProp max={80} min={0} propKey="min-chars" />
        <NumberProp max={80} min={1} propKey="max-chars" />
        <TextProp hint={t("patternHint")} mono propKey="pattern" />
        <TextProp maxLength={30} propKey="error-message" />
      </>
    ),
    TextArea: () => (
      <>
        <TextProp maxLength={20} propKey="label" />
        {nameField}
        <BooleanProp propKey="required" />
        <TextProp maxLength={80} propKey="helper-text" />
        <NumberProp max={600} min={1} propKey="max-length" />
        <TextProp maxLength={30} propKey="error-message" />
      </>
    ),
    Dropdown: () => (
      <>
        <TextProp maxLength={20} propKey="label" />
        {nameField}
        <BooleanProp propKey="required" />
        <OptionsProp withImages />
      </>
    ),
    RadioButtonsGroup: () => (
      <>
        <TextProp maxLength={30} propKey="label" />
        {nameField}
        <TextProp maxLength={300} propKey="description" />
        <BooleanProp propKey="required" />
        <EnumProp propKey="media-size" />
        <OptionsProp withImages />
      </>
    ),
    CheckboxGroup: () => (
      <>
        <TextProp maxLength={30} propKey="label" />
        {nameField}
        <TextProp maxLength={300} propKey="description" />
        <BooleanProp propKey="required" />
        <NumberProp max={20} min={0} propKey="min-selected-items" />
        <NumberProp max={20} min={1} propKey="max-selected-items" />
        <EnumProp propKey="media-size" />
        <OptionsProp withImages />
      </>
    ),
    ChipsSelector: () => (
      <>
        <TextProp maxLength={80} propKey="label" />
        {nameField}
        <TextProp maxLength={300} propKey="description" />
        <BooleanProp propKey="required" />
        <NumberProp max={20} min={0} propKey="min-selected-items" />
        <NumberProp max={20} min={1} propKey="max-selected-items" />
        <OptionsProp />
      </>
    ),
    DatePicker: () => (
      <>
        <TextProp maxLength={40} propKey="label" />
        {nameField}
        <BooleanProp propKey="required" />
        <TextProp maxLength={80} propKey="helper-text" />
        <DateProp propKey="min-date" />
        <DateProp propKey="max-date" />
        <ListProp placeholder="2026-12-25" propKey="unavailable-dates" />
      </>
    ),
    CalendarPicker: () => (
      <>
        <TextProp maxLength={40} propKey="label" />
        {nameField}
        <EnumProp allowEmpty={false} propKey="mode" />
        <BooleanProp propKey="required" />
        <TextProp maxLength={80} propKey="helper-text" />
        <DateProp propKey="min-date" />
        <DateProp propKey="max-date" />
        <NumberProp min={1} propKey="min-days" />
        <NumberProp min={1} propKey="max-days" />
        <MultiEnumProp propKey="include-days" />
        <ListProp placeholder="2026-12-25" propKey="unavailable-dates" />
      </>
    ),
    OptIn: () => (
      <>
        <TextProp maxLength={120} propKey="label" />
        {nameField}
        <BooleanProp propKey="required" />
        <ActionProp allowed={action ?? []} optional screenKey={screenKey} />
      </>
    ),
    PhotoPicker: () => (
      <>
        <TextProp maxLength={80} propKey="label" />
        {nameField}
        <TextProp maxLength={300} propKey="description" />
        <EnumProp propKey="photo-source" />
        <NumberProp max={30} min={0} propKey="min-uploaded-photos" />
        <NumberProp max={30} min={1} propKey="max-uploaded-photos" />
        <NumberProp max={25_600} min={1} propKey="max-file-size-kb" />
      </>
    ),
    DocumentPicker: () => (
      <>
        <TextProp maxLength={80} propKey="label" />
        {nameField}
        <TextProp maxLength={300} propKey="description" />
        <NumberProp max={30} min={0} propKey="min-uploaded-documents" />
        <NumberProp max={30} min={1} propKey="max-uploaded-documents" />
        <NumberProp max={25_600} min={1} propKey="max-file-size-kb" />
        <ListProp
          placeholder="application/pdf, image/jpeg"
          propKey="allowed-mime-types"
        />
      </>
    ),
    Image: () => (
      <>
        <ImageProp />
        <NumberProp max={2000} min={1} propKey="height" />
        <EnumProp propKey="scale-type" />
        <NumberProp max={10} min={0.1} propKey="aspect-ratio" step={0.1} />
        <TextProp maxLength={100} propKey="alt-text" />
      </>
    ),
    ImageCarousel: () => (
      <>
        <CarouselImagesProp />
        <EnumProp propKey="scale-type" />
        <NumberProp max={10} min={0.1} propKey="aspect-ratio" step={0.1} />
      </>
    ),
    EmbeddedLink: () => (
      <>
        <TextProp maxLength={25} propKey="text" />
        <ActionProp
          allowed={action ?? []}
          optional={false}
          screenKey={screenKey}
        />
      </>
    ),
    NavigationList: () => (
      <>
        {nameField}
        <EnumProp propKey="media-size" />
        <NavigationItemsProp screenKey={screenKey} />
      </>
    ),
    Footer: () => (
      <>
        <TextProp maxLength={35} propKey="label" />
        <ActionProp
          allowed={action ?? []}
          optional={false}
          screenKey={screenKey}
        />
        <TextProp maxLength={15} propKey="left-caption" />
        <TextProp maxLength={15} propKey="center-caption" />
        <TextProp maxLength={15} propKey="right-caption" />
      </>
    ),
    Form: () => nameField,
    If: () => <ExpressionProp propKey="condition" screenKey={screenKey} />,
    Switch: () => (
      <>
        <ExpressionProp propKey="value" screenKey={screenKey} />
        <SwitchCasesProp node={node} />
      </>
    ),
  }

  return <div className="flex flex-col gap-4">{fieldsByType[node.type]()}</div>
}

function GeneralIssues({ issues }: { issues: MiniAppValidationIssue[] }) {
  const message = useIssueMessage()
  const general = issues.filter((issue) => !issue.property)
  if (general.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
      {general.map((issue, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: issues have no id
        <span className="text-destructive text-xs" key={index}>
          {message(issue)}
        </span>
      ))}
    </div>
  )
}

export function NodeInspector({
  nodeId,
  issues,
}: {
  nodeId: string
  issues: MiniAppValidationIssue[]
}) {
  const t = useTranslations()
  const definition = useMiniAppEditor((state) => state.definition)
  const updateNodeProps = useMiniAppEditor((state) => state.updateNodeProps)
  const location = useMemo(
    () => findNode(definition, nodeId),
    [definition, nodeId],
  )
  const node = location?.node
  const nodeIssues = useMemo(
    () => issues.filter((issue) => issue.nodeId === nodeId),
    [issues, nodeId],
  )

  if (!(node && location)) {
    return null
  }
  const Icon = componentIcon[node.type]
  const context = {
    props: node.props,
    displayKeys: new Set(DISPLAY_TEXT_PROPS[node.type]),
    issues: nodeIssues,
    setProp: (key: string, value: unknown) => {
      const next = { ...node.props }
      if (value === undefined) {
        delete next[key]
      } else {
        next[key] = value
      }
      updateNodeProps(node.id, next)
    },
  }

  return (
    <InspectorContext.Provider value={context}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="font-semibold">
            {t(componentLabelKey[node.type])}
          </span>
        </div>
        <GeneralIssues issues={nodeIssues} />
        <Separator />
        <NodeFields
          key={node.id}
          node={node}
          screenId={location.screen.id}
          screenKey={location.screen.key}
        />
        <CustomFieldMapping
          key={`${node.id}:${node.customFieldId ?? ""}`}
          node={node}
        />
      </div>
    </InspectorContext.Provider>
  )
}
