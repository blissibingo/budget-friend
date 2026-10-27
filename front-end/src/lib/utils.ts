import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// joins class names, letting later tailwind classes override earlier ones
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
