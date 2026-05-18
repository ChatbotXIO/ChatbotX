import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uuid() {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString();
}

export function injectCSS(value: string | null): void {
  if (!value) return
  const style = document.createElement("style")
  style.textContent = value
  document.head.appendChild(style)
}

export function injectJS(value: string | null): void {
  if (!value) return
  const script = document.createElement("script")
  script.textContent = value
  document.body.appendChild(script)
}
