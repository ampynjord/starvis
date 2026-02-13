/**
 * Shared formatting utilities used across STARVIS views.
 */

import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * Format a numeric value for display.
 * - null/undefined → '—'
 * - Large numbers get k/M suffixes
 * - Respects decimals parameter
 * - Optional unit suffix
 */
export function fmt(v: unknown, decimals = 1, unit = ''): string {
  if (v == null || v === undefined) return '—'
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (isNaN(n)) return '—'
  if (n === 0 && !unit) return '0'

  let formatted: string
  if (Math.abs(n) >= 1_000_000) {
    formatted = (n / 1_000_000).toFixed(1) + 'M'
  } else if (Math.abs(n) >= 10_000) {
    formatted = (n / 1_000).toFixed(1) + 'k'
  } else {
    formatted = n.toLocaleString('en-US', { maximumFractionDigits: decimals })
  }

  return unit ? `${formatted} ${unit}` : formatted
}

/**
 * Format a 0–1 ratio as percentage (e.g. 0.42 → "42%")
 */
export function pct(v: number): string {
  if (v == null) return '—'
  return Math.round(v * 100) + '%'
}

/**
 * Clean a loadout port name for display.
 * e.g. "hardpoint_weapon_left" → "Weapon Left"
 */
export function portLabel(name: string): string {
  return name
    .replace(/^hardpoint_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Debounce a function call by `delay` ms.
 * Returns a wrapper that resets the timer on each call.
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T & { cancel: () => void }
  debounced.cancel = () => { if (timer) clearTimeout(timer) }
  return debounced
}

/**
 * Vue composable: close dropdown when clicking outside the referenced element.
 * Usage: useClickOutside(dropdownRef, () => { showDropdown.value = false })
 */
export function useClickOutside(target: Ref<HTMLElement | null>, handler: () => void) {
  function onClick(e: MouseEvent) {
    if (target.value && !target.value.contains(e.target as Node)) {
      handler()
    }
  }
  onMounted(() => document.addEventListener('click', onClick, true))
  onBeforeUnmount(() => document.removeEventListener('click', onClick, true))
}
