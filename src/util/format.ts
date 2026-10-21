export interface Painter {
  bold: (s: string) => string
  dim: (s: string) => string
  cyan: (s: string) => string
  green: (s: string) => string
  yellow: (s: string) => string
}

const wrap = (open: number) => (s: string) => `\u001b[${open}m${s}\u001b[0m`

export const colors: Painter = {
  bold: wrap(1),
  dim: wrap(2),
  cyan: wrap(36),
  green: wrap(32),
  yellow: wrap(33),
}

const identity = (s: string) => s

export const noColors: Painter = {
  bold: identity,
  dim: identity,
  cyan: identity,
  green: identity,
  yellow: identity,
}

/** Cuts to `max` characters (not UTF-16 units), ending with an ellipsis when something was removed. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
