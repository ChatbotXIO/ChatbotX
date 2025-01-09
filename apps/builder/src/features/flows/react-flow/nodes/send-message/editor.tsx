import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { useTranslate } from "@tolgee/react"
import { Node, useReactFlow } from "@xyflow/react"
import cloneDeep from "lodash.clonedeep"
import { CopyIcon, MoveVerticalIcon, XIcon } from "lucide-react"
import { ReactNode, useCallback, useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"

import { cn } from '@/lib/utils'

import { SendMessageEditorItem, SendMessageEditorItemType } from "./menu"
import { sendMessageNodeSchema, SendMessageNodeSchema } from "./schema"
import SendMessageEditorAction from "./send-message-editor-action"
import { BlockType } from "@/features/flows/react-flow/blocks/types";

// import components
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sortable, SortableDragHandle, SortableItem } from "@/components/ui/sortable"
import { ErrorAlert } from "@/features/flows/react-flow/blocks/error-alert"

// Import Blocks
import { TextBlockEditor } from "@/features/flows/react-flow/blocks/text/editor"
import { textBlockSchemaDefaultValue } from "@/features/flows/react-flow/blocks/text/schema"
import { ImageBlockEditor } from "@/features/flows/react-flow/blocks/image/editor";
import { imageBlockSchemaDefaultValue } from "@/features/flows/react-flow/blocks/image/schema";
import { CardBlockEditor } from "@/features/flows/react-flow/blocks/card/editor";
import { cardBlockSchemaDefaultValue } from "@/features/flows/react-flow/blocks/card/schema";
import { VideoBlockEditor } from "@/features/flows/react-flow/blocks/video/editor";
import { videoBlockSchemaDefaultValue } from "@/features/flows/react-flow/blocks/video/schema";
import { AudioBlockEditor } from "@/features/flows/react-flow/blocks/audio/editor";
import { audioBlockSchemaDefaultValue } from "@/features/flows/react-flow/blocks/audio/schema";
import { CarouselBlockEditor } from "@/features/flows/react-flow/blocks/carousel/editor";
import { carouselBlockSchemaDefaultValue } from "@/features/flows/react-flow/blocks/carousel/schema";

const maps: Record<SendMessageEditorItem, (props: { key: string, parentName: string }) => ReactNode> = {
  [SendMessageEditorItem.Text]: ({ key, parentName }) => <TextBlockEditor key={key} parentName={parentName} />,
  [SendMessageEditorItem.Image]: ({ key, parentName }) => <ImageBlockEditor key={key} parentName={parentName} />,
  [SendMessageEditorItem.Card]: ({key, parentName }) => <CardBlockEditor key={key} parentName={parentName} />,
  [SendMessageEditorItem.Video]: ({key, parentName }) => <VideoBlockEditor key={key} parentName={parentName} />,
  [SendMessageEditorItem.FileAudio]: ({key, parentName }) => <AudioBlockEditor key={key} parentName={parentName} />,
  [SendMessageEditorItem.Carousel]: ({key, parentName }) => <CarouselBlockEditor key={key} parentName={`${parentName}.cards`} />,
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

  const onClickAction = (name: SendMessageEditorItemType) => {
    switch (name) {
      case SendMessageEditorItem.Text:
        append(textBlockSchemaDefaultValue())
        break
      case SendMessageEditorItem.Image:
        append(imageBlockSchemaDefaultValue())
        break
      case SendMessageEditorItem.Card:
        append(cardBlockSchemaDefaultValue())
        break
      case SendMessageEditorItem.Carousel:
        append(carouselBlockSchemaDefaultValue())
        break
      case SendMessageEditorItem.Video:
        append(videoBlockSchemaDefaultValue())
        break
      case SendMessageEditorItem.FileAudio:
        append(audioBlockSchemaDefaultValue())
        break
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
                    <div
                      className={cn(
                        'flex gap-2 items-center',
                        field.blockType === BlockType.Carousel ? 'relative' : ''
                      )}
                    >
                      {
                        form.formState.errors.blocks?.[index] ? <ErrorAlert message={((form.formState.errors.blocks?.[index]?.message as any)?.message ?? '') as string} /> : <div className="w-4">{"\u00A0"}</div>
                      }
                      <div
                        className={cn(
                          'flex-1',
                          field.blockType === BlockType.Carousel ? 'overflow-hidden' : ''
                        )}
                      >
                        {
                          maps[field.blockType]({
                            key: field.id,
                            parentName: `blocks.${index}`,
                          })
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
