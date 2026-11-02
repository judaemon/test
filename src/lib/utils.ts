import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** How long a search box waits after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 200
