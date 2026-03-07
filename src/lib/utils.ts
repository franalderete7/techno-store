import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function parseOptionalText(value: unknown): string | null {
  return asNonEmptyString(value)
}

export function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".")
    if (!normalized) return null

    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function getErrorMessage(error: unknown, fallback = "Unexpected error"): string {
  if (!error) return fallback
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message || fallback

  if (typeof error === "object") {
    const record = error as Record<string, unknown>
    const message =
      asNonEmptyString(record.message) ??
      asNonEmptyString(record.error) ??
      asNonEmptyString(record.error_description) ??
      asNonEmptyString(record.msg)
    const details = asNonEmptyString(record.details)
    const hint = asNonEmptyString(record.hint)
    const code = asNonEmptyString(record.code)
    const parts = [message, details, hint].filter(Boolean) as string[]

    if (parts.length > 0) {
      if (code && !parts.some((part) => part.includes(code))) {
        parts.push(`code ${code}`)
      }
      return parts.join(" | ")
    }

    try {
      const json = JSON.stringify(error)
      if (json && json !== "{}") return json
    } catch {
      // ignore
    }
  }

  return fallback
}
