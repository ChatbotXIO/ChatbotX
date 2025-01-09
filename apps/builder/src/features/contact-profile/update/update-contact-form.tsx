import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CalendarIcon, Loader2 } from "lucide-react";
import { updateContactAction } from "./update-contact-action";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FieldType,
  UpdateContactFieldAction,
  UpdateContactSchema,
  updateContactSchema,
} from "./update-contact-schema";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { toast } from "sonner";
import React from "react";
import { CustomFieldType, Field } from "../create/create-field-schema";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export const GenerateUpdateContactForm = (props: {
  fieldType: FieldType;
  contactId: string;
  contactField: Field;
  onChange: (contactField: UpdateContactSchema) => void;
  setOpen: (open: boolean) => void;
}) => {
  const [formActionValue, setFormActionValue] = React.useState<string | null>(
    "",
  );
  const renderFormControl = () => {
    switch (props.contactField.customFieldType) {
      case CustomFieldType.ShortText:
        return (
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder={`Enter the ${props.contactField.name.toLowerCase()}`}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        );
      case CustomFieldType.LongText:
        return (
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder={`Enter the ${props.contactField.name.toLowerCase()}`}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        );
      case CustomFieldType.Number:
        return (
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={`Enter the ${props.contactField.name.toLowerCase()}`}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        );
      case CustomFieldType.Boolean:
        const [checked, setChecked] = React.useState(
          props.contactField.value === "1" ? true : false,
        );
        return (
          <>
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Checkbox
              checked={checked}
              onCheckedChange={(e: boolean) => {
                form.setValue("value", e ? "1" : "0");
                setChecked(e);
              }}
            ></Checkbox>
          </>
        );
      case CustomFieldType.Date:
        const [open, setOpen] = React.useState(false);
        const [date, setDate] = React.useState<Date>();

        return (
          <>
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Popover open={open}>
              <PopoverTrigger onClick={() => setOpen(true)} asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon />
                  {date ? format(date, "dd/MM/yyyy") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                onPointerDownOutside={() => setOpen(true)}
                className="w-auto p-0"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(e) => {
                    setDate(e);
                    if (e) {
                      form.setValue("value", format(e, "yyyy-MM-dd"));
                    }
                    setOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </>
        );
      case CustomFieldType.DateTime:
        const [isOpen, setIsOpen] = React.useState(false);
        const [datetime, setDatetime] = React.useState<Date>();

        const hours = Array.from({ length: 24 }, (_, i) => i);
        const handleDateSelect = (selectedDate: Date | undefined) => {
          if (selectedDate) {
            setDatetime(selectedDate);
            if (selectedDate) {
              form.setValue("value", format(selectedDate, "yyyy-MM-dd HH:mm"));
            }
          }
        };

        const handleTimeChange = (type: "hour" | "minute", value: string) => {
          if (datetime) {
            const newDate = new Date(datetime);
            if (type === "hour") {
              newDate.setHours(parseInt(value));
            } else if (type === "minute") {
              newDate.setMinutes(parseInt(value));
            }
            setDatetime(newDate);
            form.setValue("value", format(newDate, "yyyy-MM-dd HH:mm"));
          }
        };

        return (
          <>
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Popover open={isOpen} onOpenChange={setIsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !datetime && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {datetime ? (
                    format(datetime, "dd/MM/yyyy HH:mm")
                  ) : (
                    <span>DD/MM/YYYY HH:mm</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <div className="sm:flex">
                  <Calendar
                    mode="single"
                    selected={datetime}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                  <div className="flex flex-col sm:flex-row sm:h-[300px] divide-y sm:divide-y-0 sm:divide-x">
                    <ScrollArea className="w-64 sm:w-auto">
                      <div className="flex sm:flex-col p-2">
                        {hours.reverse().map((hour) => (
                          <Button
                            key={hour}
                            size="icon"
                            variant={
                              datetime && datetime.getHours() === hour
                                ? "default"
                                : "ghost"
                            }
                            className="sm:w-full shrink-0 aspect-square"
                            onClick={() =>
                              handleTimeChange("hour", hour.toString())
                            }
                          >
                            {hour}
                          </Button>
                        ))}
                      </div>
                      <ScrollBar
                        orientation="horizontal"
                        className="sm:hidden"
                      />
                    </ScrollArea>
                    <ScrollArea className="w-64 sm:w-auto">
                      <div className="flex sm:flex-col p-2">
                        {Array.from({ length: 12 }, (_, i) => i * 5).map(
                          (minute) => (
                            <Button
                              key={minute}
                              size="icon"
                              variant={
                                datetime && datetime.getMinutes() === minute
                                  ? "default"
                                  : "ghost"
                              }
                              className="sm:w-full shrink-0 aspect-square"
                              onClick={() =>
                                handleTimeChange("minute", minute.toString())
                              }
                            >
                              {minute.toString().padStart(2, "0")}
                            </Button>
                          ),
                        )}
                      </div>
                      <ScrollBar
                        orientation="horizontal"
                        className="sm:hidden"
                      />
                    </ScrollArea>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </>
        );
    }
  };

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateContactAction.bind(
      null,
      props.contactId,
      props.contactField.name,
      props.fieldType,
    ),
    zodResolver(updateContactSchema),
    {
      actionProps: {
        onSuccess: () => {
          props.onChange(form.getValues());

          props.setOpen(false);
          toast.success("Contact updated successfully");
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError.message ?? error.serverError);
          }

          if (error.validationErrors) {
            toast.error(error.validationErrors.value?._errors);
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          value: props.contactField.value as string,
        },
      },
      errorMapProps: {},
    },
  );

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitWithAction();
        }}
        method="POST"
      >
        <CardHeader>
          <CardTitle className="text-center">
            {props.contactField.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <FormField
              control={form.control}
              name="action"
              defaultValue={UpdateContactFieldAction.Update}
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input {...field} value={formActionValue as string} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            ></FormField>

            <div className="flex flex-col space-y-1.5">
              {renderFormControl()}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="destructive"
            onClick={() => {
              form.setValue("action", UpdateContactFieldAction.Delete);
              form.setValue("value", "");
            }}
          >
            {form.formState.isSubmitting && (
              <Loader2 className="animate-spin" />
            )}
            Delete
          </Button>

          <Button
            name="action"
            value={"Update"}
            type="submit"
            disabled={form.formState.isSubmitting}
            onClick={() => {
              form.setValue("action", UpdateContactFieldAction.Update);
            }}
          >
            {form.formState.isSubmitting && (
              <Loader2 className="animate-spin" />
            )}
            Save
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
};
