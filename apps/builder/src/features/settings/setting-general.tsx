
"use client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch"
import { SketchPicker } from 'react-color'
import { ArrowDown, Check, ChevronsUpDown, Facebook } from 'lucide-react';
import timezones from 'timezones.json';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import _ from 'lodash';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type defaultLanguage = {
  name: string,
  value: string,
}

type country = {
  name: string,
  value: string,
}

const General = () => {
  const arrDefaultLanguage: defaultLanguage[] = [
    { name: "Afrikaans", value: "afrikaans" },
    { name: "Arabic", value: "arabic" },
    { name: "Bengali", value: "bengali" },
    { name: "English US", value: "engUs" },
    { name: "Vietnamese", value: "Vietnamese" }
  ]

  const arrCountries: country[] = [
    { name: "Unknown", value: "unknown" },
    { name: "Afrikaans", value: "afrikaans" },
    { name: "Arabic", value: "arabic" },
    { name: "Bengali", value: "bengali" },
    { name: "English US", value: "engUs" },
    { name: "Vietnamese", value: "Vietnamese" }
  ]

  const [showPicker, setShowPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000")
  const [openTimeZone, setOpenTimeZone] = useState(false)
  const [value, setValue] = useState("")

  const togglePicker = () => {
    setShowPicker(!showPicker);
  };

  const handleOnChangeColor = (color: any) => {
    setCurrentColor(color.hex);
  }

  const haveListTimeZone = _.flatMap(timezones, 'utc');
  const [viewListTimeZones] = useState(haveListTimeZone);

  return (
    <div className="flex flex-col gap-y-4 pt-4">
      <Card className="md:grid md:grid-cols-12">
        <CardHeader className="col-span-3">
          <CardTitle>Default Reply</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent className="col-span-4 flex justify-center items-center">
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Generic Default Reply" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="default">Generic Default Reply</SelectItem>
                <SelectItem value="list">
                  SYSTEM - List of frequently asked questions
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardContent>
        <CardFooter className="col-span-5">
          <p className="text-[#6c757d] text-base">It is the default response that your chatbot will send to users when the
            chatbot doesn't know how to respond to the user message. Use a condition
            on your starting step if you want to send different messages based on the
            user channel.</p>
        </CardFooter>
      </Card>

      <Card className="md:grid md:grid-cols-12">
        <CardHeader className="col-span-3">
          <CardTitle>Target country</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent className="col-span-4 flex justify-center items-center">
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="English US" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {
                  (arrCountries || []).map((country) => {
                    return (
                      <SelectItem value={country.value}>{country.name}</SelectItem>
                    )
                  })
                }
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardContent>
        <CardFooter className="col-span-5">
          <p className="text-[#6c757d] text-base">
            The country where most of your contacts live. The bot automatically adds the country code to a phone number shared by your contacts to make it a valid WhatsApp or SMS contact.
          </p>
        </CardFooter>
      </Card>

      <Card className="md:grid md:grid-cols-12">
        <CardHeader className="col-span-3">
          <CardTitle>Default Language</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent className="col-span-4 flex justify-center items-center">
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="English US" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {
                  (arrDefaultLanguage || []).map((language) => {
                    return (
                      <SelectItem value={language.value}>{language.name}</SelectItem>
                    )
                  })
                }
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardContent>
        <CardFooter className="col-span-5">
          <p className="text-[#6c757d] text-base">
            Contacts are assigned the default language when the the contact language is unknown.
          </p>
        </CardFooter>
      </Card>

      <Card className="md:grid md:grid-cols-12">
        <CardHeader className="col-span-3">
          <CardTitle>Timezone</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent className="col-span-4 flex justify-center items-center">
          <Popover open={openTimeZone} onOpenChange={setOpenTimeZone}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openTimeZone}
                className="w-full justify-between"
              >
                {value
                  ? viewListTimeZones.find((timezone) => timezone === value)
                  : "Select framework..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className=" p-0">
              <Command>
                <CommandInput placeholder="Search framework..." />
                <CommandList>
                  <CommandEmpty>No framework found.</CommandEmpty>
                  <CommandGroup>
                    {(viewListTimeZones || []).map((timezone, index) => (
                      <CommandItem
                        key={timezone}
                        value={timezone}
                        onSelect={(currentValue) => {
                          setValue(currentValue === value ? "" : currentValue)
                          setOpenTimeZone(false)
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${value === timezone ? "opacity-100" : "opacity-0"}`}
                        />
                        {timezone}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardContent>
        <CardFooter className="col-span-5">
          <p className="text-[#6c757d] text-base"> Contacts are assigned this timezone when the the contact timezone is unknown.</p>
        </CardFooter>
      </Card>

      <Card className="md:grid md:grid-cols-12">
        <CardHeader className="col-span-3">
          <CardTitle>Brand Color</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent className="col-span-4 flex justify-center items-center">


          <Dialog open={showPicker} onOpenChange={togglePicker}>
            <DialogTrigger asChild>
              <Button
                onClick={togglePicker}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                style={{ backgroundColor: currentColor }}
              >
                <ArrowDown />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Brand Color</DialogTitle>
              </DialogHeader>
              <SketchPicker color={currentColor} onChangeComplete={handleOnChangeColor} />
              <DialogFooter>
                <Button variant="destructive" onClick={togglePicker}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
        <CardFooter className="col-span-5">
          <p className="text-[#6c757d] text-base">
            This color is used on buttons to match your branding on the landing page, emails and webchat.
          </p>
        </CardFooter>
      </Card>

      <Card className="md:grid md:grid-cols-12">
        <CardHeader className="col-span-3">
          <CardTitle>Development Mode</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent className="col-span-4 flex justify-center items-center">
          <Switch id="" />

        </CardContent>
        <CardFooter className="col-span-5">
          <p className="text-[#6c757d] text-base">
            Your bot will work only for bot admins. Enable this option if you are building your bot and don't want non admins to use the bot.
          </p>
        </CardFooter>
      </Card>


      <Card className="md:grid md:grid-cols-12">
        <CardHeader className="col-span-3">
          <CardTitle>Delete Account</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent className="col-span-4 flex justify-center items-center">
          <Button variant="destructive" className="w-full">Delete</Button>
        </CardContent>
        <CardFooter className="col-span-5">
          <p className="text-[#6c757d] text-base">
            All your data associated to this chatbot will be deleted in 24 hours.

          </p>
        </CardFooter>
      </Card>

      <div className="flex content-center justify-center py-4 gap-x-10">
        <Button type="button"><u>Rename Account</u></Button>
        <Button type="button"><u>Change Account Logo</u></Button>
      </div>

      <div className="mt-4 text-center">
        <p className="text-gray-500">User  ID: 1001966523</p>
        <p className="text-gray-500">Account ID: 1712583</p>
        <p className="text-gray-500">Key: n8S4ll3s8ocJ0ykHN77L</p>
      </div>
    </div>
  )
}

export default General
