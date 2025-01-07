"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent, DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomFieldType, FieldType } from "@ahachat.ai/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { useTranslate } from '@tolgee/react';
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEventHandler, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { toast } from "sonner";
import { createFieldAction } from "./actions/create-field-action";
import { createFieldSchema } from "./schemas/create-field-schema";
import { setHours, setMinutes } from "date-fns";

export function CreateAccountFieldDialog({ chatbotId, folderId }: { chatbotId: string, folderId: string | null }) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const router = useRouter()
  const [customFieldType, setCustomFieldType] = useState<CustomFieldType>("ShortText");
  const fieldType = FieldType.AccountField
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedDateTime, setSelectedDateTime] = useState<Date>();
  const [timeValue, setTimeValue] = useState<string>("00:00");

  const handleTimeChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const time = e.target.value;
    if (!selectedDateTime) {
      setTimeValue(time);
      return;
    }
    const [hours, minutes] = time.split(":").map((str) => parseInt(str, 10));
    const newSelectedDate = setHours(setMinutes(selectedDateTime, minutes as any), hours as any);
    setSelectedDateTime(newSelectedDate);
    setTimeValue(time);
    form.setValue("value", selectedDateTime ? selectedDateTime.toLocaleString() : "")
  };

  const handleDaySelect = (date: Date | undefined) => {
    if (!timeValue || !date) {
      setSelectedDateTime(date);
      return;
    }
    const [hours, minutes] = timeValue
      .split(":")
      .map((str) => parseInt(str, 10));
    const newDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hours,
      minutes
    );
    setSelectedDateTime(newDate);
  };

  const {
    form,
    handleSubmitWithAction
  } = useHookFormAction(createFieldAction.bind(null, chatbotId, folderId, fieldType), zodResolver(createFieldSchema), {
    actionProps: {
      onSuccess: () => {
        toast.success(`Field created successfully`)

        setOpen(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      }
    },
    formProps: {
      mode: "onChange",
      defaultValues: {
        name: "",
        customFieldType: "ShortText",
        value: "",
        description: "",
        showInInbox: false
      },
    },
    errorMapProps: {}
  });

  const renderValueInput = () => {
    switch (customFieldType) {
      case "ShortText":
        return (
          <FormControl>
            <Input placeholder="Enter text" {...form.register("value")} />
          </FormControl>
        );
      case "Number":
        return (
          <FormControl>
            <Input type="number" placeholder="Enter number" {...form.register("value")} />
          </FormControl>
        );
      case "Boolean":
        return (
          <FormControl>
            <Select
              onValueChange={(value) => form.setValue("value", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select true/false" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          </FormControl>
        );
      case "Date":
        return (
          <FormControl>
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                form.setValue("value", date ? date.toLocaleDateString() : "");
              }}
              footer={
                selectedDate ? `Selected: ${selectedDate.toLocaleDateString()}` : "Pick a day."
              }
            />
          </FormControl>
        );
      case "DateTime":
        return (
          <div>
            <label>
              Set the time:{" "}
              <input type="time" value={timeValue} onChange={handleTimeChange} />
            </label>
            <DayPicker
              mode="single"
              selected={selectedDateTime}
              onSelect={handleDaySelect}
              footer={`Selected date: ${selectedDateTime ? selectedDateTime.toLocaleString() : "none"}`}
            />
          </div>
        );
      case "LongText":
        return (
          <FormControl>
            <Input placeholder="Enter text" {...form.register("value")} />
          </FormControl>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Field</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Field</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customFieldType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field Type</FormLabel>
                  <FormControl>
                    <Select
                      value={customFieldType}
                      onValueChange={(value) => {
                        setCustomFieldType(value as any);
                        form.setValue("customFieldType", value as any);
                        form.setValue("value", "");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a field type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ShortText">Short Text</SelectItem>
                        <SelectItem value="Number">Number</SelectItem>
                        <SelectItem value="Date">Date</SelectItem>
                        <SelectItem value="DateTime">DateTime</SelectItem>
                        <SelectItem value="Boolean">Boolean</SelectItem>
                        <SelectItem value="LongText">Long Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="value"
              render={() => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  {renderValueInput()}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel-btn')}</Button>
              <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
                {t('common.confirm-btn')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
