import type { Comparable } from '../drop/comparable'
import { toValue } from './underscore'

/**
 * A float, distinct from integers as in Ruby: `2.0` renders as `2.0`.
 * Used by the `rubyNumbers` option; wrap floats in data with it, since JS numbers can't tell `2.0` from `2`.
 */
export class LiquidFloat implements Comparable {
  constructor (public readonly value: number) {}

  valueOf () {
    return this.value
  }

  toString () {
    return formatFloat(this.value)
  }

  toJSON () {
    const rawJSON = (JSON as any).rawJSON
    return rawJSON && Number.isFinite(this.value) ? rawJSON(formatFloat(this.value)) : this.value
  }

  equals (rhs: unknown) {
    const r = toValue(rhs)
    return (typeof r === 'number' || r instanceof LiquidFloat) && Number(r) === this.value
  }

  gt (rhs: unknown) { return this.value > (toValue(rhs) as number) }
  geq (rhs: unknown) { return this.value >= (toValue(rhs) as number) }
  lt (rhs: unknown) { return this.value < (toValue(rhs) as number) }
  leq (rhs: unknown) { return this.value <= (toValue(rhs) as number) }
}

export function isLiquidFloat (value: unknown): value is LiquidFloat {
  return value instanceof LiquidFloat
}

/**
 * Formats like Ruby's Float#to_s: shortest round-trip digits, always with a
 * fractional part. Exponent notation (`1.0e+15`, `1.0e-05`) below 1e-4, and
 * from 1e16 up; between 1e15 and 1e16 only when the value has no fractional
 * digits (`1.0e+15`, but `3000000000000000.5`).
 */
export function formatFloat (x: number): string {
  if (Number.isNaN(x)) return 'NaN'
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity'
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0'
  const sign = x < 0 ? '-' : ''
  const [mantissa, exponent] = Math.abs(x).toExponential().split('e')
  const digits = mantissa.replace('.', '')
  const exp = Number(exponent)
  if (exp < -4 || exp >= 16 || (exp === 15 && digits.length <= 16)) {
    const expSign = exp < 0 ? '-' : '+'
    return `${sign}${digits[0]}.${digits.slice(1) || '0'}e${expSign}${String(Math.abs(exp)).padStart(2, '0')}`
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`
  const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0')
  return `${sign}${intPart}.${digits.slice(exp + 1) || '0'}`
}
