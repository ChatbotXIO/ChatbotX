import InputWithEmoji from "@/components/input-with-emoji";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslate } from "@tolgee/react";
import { useForm } from "react-hook-form";
import StepImage from "../../steps/step-image";
import { SendMessageEditorItemType } from "./menu";
import SendMessageEditorAction from "./send-message-editor-action";
import { Separator } from "@/components/ui/separator";
import { DndContext } from "@dnd-kit/core";

export default function SendMessageEditor() {
  const { t } = useTranslate()

  const form = useForm()

  const onClickAction = (name: SendMessageEditorItemType) => {
    console.log('onClickActionnnnn', name)
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={() => { }}>
          <FormField control={form.control} name="channel" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('flows.sendMessageNode.channel')}</FormLabel>
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
        </form>
      </Form>

      <Separator />

      <div className="flex flex-col flex-1 gap-4">
        <DndContext>
          {/* <Draggable /> */}
        </DndContext>
        <InputWithEmoji />
        <StepImage />
      </div>

      <SendMessageEditorAction onClick={onClickAction} />
    </>
  )
}
