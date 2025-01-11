import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { ScrollArea } from "@/components/ui/scroll-area"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslate } from "@tolgee/react"
import { type Node, useReactFlow } from "@xyflow/react"
import { Trash, TrashIcon, XIcon } from "lucide-react"
import { useCallback, useEffect } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { SplitTrafficBlockEditor } from "../../blocks/split-traffic/editor"
import { splitTrafficBlockDefaultValue } from "../../blocks/split-traffic/schema"
import { type SplitTrafficNodeSchema, splitTrafficNodeSchema } from "./schema"

export default function SplitTrafficNodeEditor({
  activeNode,
}: { activeNode: Node<SplitTrafficNodeSchema> }) {
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

  const { control, getValues, watch, ...form } =
    useForm<SplitTrafficNodeSchema>({
      resolver: zodResolver(splitTrafficNodeSchema),
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

  const addTraffic = () => {
    append(splitTrafficBlockDefaultValue())
  }

  // const onClickAction = (name: SendMessageEditorItemType) => {
  //   switch (name) {
  //     case SendMessageEditorItem.SendText:
  //       append(sendTextBlockDefaultValue())
  //       break
  // case SendMessageEditorItem.Image:
  //   append(sendImageBlockDefaultValue())
  //   break
  //   }
  // }

  // const onCopy = (index: number) => {
  //   const values = getValues(`blocks.${index}`)
  //   if (values) {
  //     insert(index + 1, { ...cloneDeep(values), id: createId() })
  //   }
  // }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const onSubmit = (data: any) => {
    console.log("Form Data:", data)
  }

  return (
    <>
      <Form {...form} getValues={getValues} control={control} watch={watch}>
        <form
          className="flex-1 flex flex-col h-full"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <ScrollArea className="flex-1">
            <div className="flex flex-col my-2 divide-y">
              {fields.map((field, index) => (
                <div className="flex items-center gap-2" key={field.id}>
                  <SplitTrafficBlockEditor parentName={`blocks.${index}`} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => remove(index)}
                  >
                    <TrashIcon
                      className="text-destructive size-4"
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Button onClick={addTraffic}>{t("flows.addTrafficBtn")}</Button>

          {/* <Button>Test Form Submit</Button> */}

          {/* <SendMessageEditorAction onClick={onClickAction} /> */}
        </form>
      </Form>
    </>
  )
}
