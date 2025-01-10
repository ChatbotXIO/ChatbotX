import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sortable, SortableDragHandle, SortableItem } from "@/components/ui/sortable"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { useTranslate } from "@tolgee/react"
import { Node, useReactFlow } from "@xyflow/react"
import cloneDeep from "lodash.clonedeep"
import { CopyIcon, MoveVerticalIcon, XIcon } from "lucide-react"
import { ReactNode, useCallback, useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { ActionType } from "../../action-type"
import { ErrorAlert } from "../../blocks/error-alert"
import { SendTextBlockEditor } from "../../blocks/send-text/editor"
import { sendTextBlockDefaultValue } from "../../blocks/send-text/schema"
import { SendMessageNodeSchema, sendMessageNodeSchema } from "./schema"
import SendMessageEditorAction from "./send-message-editor-action"

const maps: Record<ActionType, (props: { key: string, parentName: string }) => ReactNode> = {
  [ActionType.SendText]: ({ key, parentName }) => {
    return <SendTextBlockEditor key={key} parentName={parentName} />
  }
  // [SendMessageEditorItem.Image]: (key: string, control: any, blockName: string) => <SendTextBlockEditor key={key} control={control} blockName={blockName} />
}

export default function SendMessageNodeEditor({ activeNode }: { activeNode: Node<SendMessageNodeSchema> }) {
  const { t } = useTranslate()

  const { setNodes } = useReactFlow()
  const onChange = useCallback((data: any) => {
    setNodes(nodes => nodes.map(node => {
      if (node.id === activeNode.id) {
        return {
          ...node,
          data: {
            ...node.data,
            ...data
          }
        };
      }
      return node;
    }));
  }, [activeNode, setNodes]);

  const { control, getValues, watch, ...form } = useForm<SendMessageNodeSchema>({
    resolver: zodResolver(sendMessageNodeSchema),
    defaultValues: activeNode.data
  })

  useEffect(() => {
    const { unsubscribe } = watch((value) => {
      onChange(value)
    })
    return () => unsubscribe()
  }, [watch])

  const { fields, append, move, update, remove, insert } = useFieldArray({ control, name: 'blocks' })

  const onClickAction = (name: ActionType) => {
    switch (name) {
      case ActionType.SendText:
        append(sendTextBlockDefaultValue())
        break
      // case SendMessageEditorItem.Image:
      //   append(imageBlockSchemaDefaultValue())
      //   break
    }
  }

  const onCopy = (index: number) => {
    const values = getValues(`blocks.${index}`)
    if (values) {
      insert(index + 1, { ...cloneDeep(values), id: createId() })
    }
  }

  const onSubmit = (data: any) => {
    console.log('Form Data:', data)
  }

  return (
    <>
      <Form {...form} getValues={getValues} control={control} watch={watch}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormField control={control} name="messageType" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('flows.SendMessageNodeViewer.channel')}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Omnichannel">Omnichannel</SelectItem>
                  <SelectItem value="Messenger">Messenger</SelectItem>
                  <SelectItem value="Whatsapp">Whatsapp</SelectItem>
                  <SelectItem value="Webchat">Webchat</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
          />

          <Separator />

          <div className="flex flex-col flex-1 gap-2 my-2">
            <Sortable
              value={fields}
              onMove={({ activeIndex, overIndex }) =>
                move(activeIndex, overIndex)
              }
              overlay={
                <div className="w-full h-32 rounded-sm bg-primary/10" />
              }
            >
              <div className="flex w-full flex-col gap-4">
                {fields.map((field, index) => (
                  <SortableItem key={field.id} value={field.id} asChild>
                    <div className="flex gap-2 items-center">
                      {
                        form.formState.errors.blocks?.[index] ? <ErrorAlert message={((form.formState.errors.blocks?.[index]?.message as any)?.message ?? '') as string} /> : <div className="w-4">{"\u00A0"}</div>
                      }
                      <div className="flex-1">
                        {
                          field.actionType in ActionType ? maps[field.actionType as ActionType]({
                            key: field.id,
                            parentName: `blocks.${index}`,
                          }) : null
                        }
                      </div>
                      <div className="flex flex-col">
                        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => remove(index)}>
                          <XIcon className="size-4" aria-hidden="true" />
                        </Button>
                        <SortableDragHandle variant="ghost" size="icon" className="size-8 shrink-0">
                          <MoveVerticalIcon className="size-4" aria-hidden="true" />
                        </SortableDragHandle>
                        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onCopy(index)}>
                          <CopyIcon className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </SortableItem>
                ))}
              </div>
            </Sortable>
          </div>

          <Button>Test Form Submit</Button>

          <SendMessageEditorAction onClick={onClickAction} />

        </form>
      </Form >
    </>
  )
}
