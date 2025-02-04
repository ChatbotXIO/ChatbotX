import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/ui/sortable"
import {
  ActionType,
  disabledCopyActionTypes,
} from "@/features/flows/react-flow/action-type"
import { CodeBlockEditor } from "@/features/flows/react-flow/blocks/code/editor"
import { codeBlockDefaultValue } from "@/features/flows/react-flow/blocks/code/schema"
import { ErrorAlert } from "@/features/flows/react-flow/blocks/error-alert"
import { HeadingBlockEditor } from "@/features/flows/react-flow/blocks/heading/editor"
import { headingBlockDefaultValue } from "@/features/flows/react-flow/blocks/heading/schema"
import { ImageBlockEditor } from "@/features/flows/react-flow/blocks/image/editor"
import { imageBlockDefaultValue } from "@/features/flows/react-flow/blocks/image/schema"
import { InputBlockEditor } from "@/features/flows/react-flow/blocks/input/editor"
import { LineBlockEditor } from "@/features/flows/react-flow/blocks/line/editor"
import { lineBlockDefaultValue } from "@/features/flows/react-flow/blocks/line/schema"
import { SelectBlockEditor } from "@/features/flows/react-flow/blocks/select/editor"
import { SingleButtonBlockEditor } from "@/features/flows/react-flow/blocks/single-button/editor"
import { singleButtonBlockDefaultValue } from "@/features/flows/react-flow/blocks/single-button/schema"
import { SpacingBlockEditor } from "@/features/flows/react-flow/blocks/spacing/editor"
import { spacingBlockDefaultValue } from "@/features/flows/react-flow/blocks/spacing/schema"
import { TextBlockEditor } from "@/features/flows/react-flow/blocks/text/editor"
import { textBlockDefaultValue } from "@/features/flows/react-flow/blocks/text/schema"
import { cn } from "@/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { useTranslate } from "@tolgee/react"
import { type Node, useReactFlow } from "@xyflow/react"
import cloneDeep from "lodash.clonedeep"
import { CopyIcon, MoveVerticalIcon, XIcon } from "lucide-react"
import { type ReactNode, useCallback, useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { type SendMailNodeSchema, sendMailNodeSchema } from "./schema"
import SendMailEditorAction from "./send-mail-editor-action"

const maps: Record<
  | ActionType.Spacing
  | ActionType.Heading
  | ActionType.Text
  | ActionType.SingleButton
  | ActionType.Line
  | ActionType.Image
  | ActionType.Code
  | ActionType.From
  | ActionType.To
  | ActionType.Subject
  | ActionType.PreHeader
  | ActionType.EmailTopic,
  (props: { key: string; parentName: `blocks.${number}` }) => ReactNode
> = {
  [ActionType.Heading]: ({ key, parentName }) => (
    <HeadingBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.Spacing]: ({ key, parentName }) => (
    <SpacingBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.Text]: ({ key, parentName }) => (
    <TextBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.SingleButton]: ({ key, parentName }) => (
    <SingleButtonBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.Line]: ({ key, parentName }) => (
    <LineBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.Image]: ({ key, parentName }) => (
    <ImageBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.Code]: ({ key, parentName }) => (
    <CodeBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.From]: ({ key, parentName }) => (
    <InputBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.To]: ({ key, parentName }) => (
    <InputBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.Subject]: ({ key, parentName }) => (
    <InputBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.PreHeader]: ({ key, parentName }) => (
    <InputBlockEditor key={key} parentName={parentName} />
  ),
  [ActionType.EmailTopic]: ({ key, parentName }) => (
    <SelectBlockEditor key={key} parentName={parentName} />
  ),
}

export default function SendMailNodeEditor({
  activeNode,
}: {
  activeNode: Node<SendMailNodeSchema>
}) {
  const { t } = useTranslate()

  const { setNodes } = useReactFlow()
  const onChange = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (data: any) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === activeNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                ...data,
              },
            }
          }
          return node
        }),
      )
    },
    [activeNode, setNodes],
  )

  const { control, getValues, watch, ...form } = useForm<SendMailNodeSchema>({
    resolver: zodResolver(sendMailNodeSchema),
    defaultValues: activeNode.data,
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const { unsubscribe } = watch((value) => {
      onChange(value)
    })
    return () => unsubscribe()
  }, [watch])

  const { fields, append, move, update, remove, insert } = useFieldArray({
    control,
    name: "blocks",
  })

  const onClickAction = (name: ActionType) => {
    switch (name) {
      case ActionType.Heading:
        append(headingBlockDefaultValue("Header #1"))
        break
      case ActionType.Spacing:
        append(spacingBlockDefaultValue())
        break
      case ActionType.Text:
        append(textBlockDefaultValue())
        break
      case ActionType.SingleButton:
        append(singleButtonBlockDefaultValue("Add Button"))
        break
      case ActionType.Line:
        append(lineBlockDefaultValue())
        break
      case ActionType.Image:
        append(imageBlockDefaultValue())
        break
      case ActionType.Code:
        append(codeBlockDefaultValue("Hello World."))
        break
    }
  }

  const onCopy = (index: number) => {
    const values = getValues(`blocks.${index}`)
    if (values) {
      insert(index + 1, { ...cloneDeep(values), id: createId() })
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const onSubmit = (data: any) => {
    console.log("Form Data:", data)
  }

  return (
    <>
      <Form {...form} getValues={getValues} control={control} watch={watch}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col flex-1 gap-2 my-2">
            <Sortable
              value={fields}
              onMove={({ activeIndex, overIndex }) =>
                move(activeIndex, overIndex)
              }
              overlay={<div className="w-full h-32 rounded-sm bg-primary/10" />}
            >
              <div className="flex w-full flex-col gap-4">
                {fields.map((field, index) => (
                  <SortableItem key={field.id} value={field.id} asChild>
                    <div className={cn("flex gap-2 items-center")}>
                      {form.formState.errors.blocks?.[index] ? (
                        <ErrorAlert
                          message={
                            typeof form.formState.errors.blocks?.[index]
                              ?.message === "object"
                              ? ((
                                  form.formState.errors.blocks?.[index]
                                    ?.message as { message: string }
                                ).message as string)
                              : ""
                          }
                        />
                      ) : (
                        <div className="w-4">{"\u00A0"}</div>
                      )}
                      <div className={cn("flex-1")}>
                        {field.actionType in ActionType
                          ? maps[field.actionType]({
                              key: field.id,
                              parentName: `blocks.${index}`,
                            })
                          : null}
                      </div>
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => remove(index)}
                        >
                          <XIcon className="size-4" aria-hidden="true" />
                        </Button>
                        <SortableDragHandle
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                        >
                          <MoveVerticalIcon
                            className="size-4"
                            aria-hidden="true"
                          />
                        </SortableDragHandle>
                        {!disabledCopyActionTypes.includes(
                          field.actionType,
                        ) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            onClick={() => onCopy(index)}
                          >
                            <CopyIcon className="size-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </SortableItem>
                ))}
              </div>
            </Sortable>
          </div>

          <SendMailEditorAction onClick={onClickAction} />
        </form>
      </Form>
    </>
  )
}
