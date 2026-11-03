import { toArray, toValue, stringify, isArray, LiquidRuntimeError } from '../util'
import { Decimal } from '../util/decimal'
import { LiquidFloat } from '../util/liquid-float'
import type { FilterImpl } from '../template'
import type { Scope } from '../context'

// integer, finite float as Decimal, or non-finite float
type RubyNumber = number | Decimal

const isInteger = (n: RubyNumber): n is number => typeof n === 'number' && Number.isInteger(n)
const isSpecial = (n: RubyNumber): n is number => typeof n === 'number' && !Number.isFinite(n)

/** Shopify/liquid's `Utils.to_number`. */
function toRubyNumber (value: unknown): RubyNumber {
  value = toValue(value)
  if (value instanceof LiquidFloat) {
    return Number.isFinite(value.value) ? Decimal.fromNumber(value.value) : value.value
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) || !Number.isFinite(value)) return value
    return Decimal.fromNumber(value)
  }
  if (typeof value === 'string') return Decimal.parse(value) ?? rubyStringToInteger(value)
  return 0
}

/** Ruby's `String#to_i`: optional sign, digits with single underscores between. */
function rubyStringToInteger (str: string): number {
  const m = /^\s*([+-]?)(\d+(?:_\d+)*)/.exec(str)
  return m ? Number(m[1] + m[2].replace(/_/g, '')) || 0 : 0
}

function toLiquid (n: RubyNumber): number | LiquidFloat {
  if (n instanceof Decimal) return new LiquidFloat(n.toNumber())
  return isInteger(n) ? n : new LiquidFloat(n)
}

const asDecimal = (n: number | Decimal) => n instanceof Decimal ? n : Decimal.fromInteger(n)
const asDouble = (n: RubyNumber) => n instanceof Decimal ? n.toNumber() : n

function divisionByZero (): never {
  throw new LiquidRuntimeError('divided by 0')
}

type Operation = '+' | '-' | '*' | '/' | '%'

function apply (input: unknown, operand: unknown, op: Operation): number | LiquidFloat {
  const a = toRubyNumber(input)
  const b = toRubyNumber(operand)
  if (isInteger(a) && isInteger(b)) {
    switch (op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return b === 0 ? divisionByZero() : Math.floor(a / b)
      case '%': return b === 0 ? divisionByZero() : ((a % b) + b) % b
    }
  }
  if (isSpecial(a) || isSpecial(b)) {
    const x = asDouble(a)
    const y = asDouble(b)
    switch (op) {
      case '+': return new LiquidFloat(x + y)
      case '-': return new LiquidFloat(x - y)
      case '*': return new LiquidFloat(x * y)
      case '/': return new LiquidFloat(x / y)
      case '%': return y === 0 ? divisionByZero() : new LiquidFloat(x - y * Math.floor(x / y))
    }
  }
  const x = asDecimal(a)
  const y = asDecimal(b)
  switch (op) {
    case '+': return toLiquid(x.add(y))
    case '-': return toLiquid(x.sub(y))
    case '*': return toLiquid(x.mul(y))
    case '/': return new LiquidFloat(x.div(y))
    case '%': return y.isZero() ? divisionByZero() : toLiquid(x.mod(y))
  }
}

export const plus = (v: unknown, arg: unknown) => apply(v, arg, '+')
export const minus = (v: unknown, arg: unknown) => apply(v, arg, '-')
export const times = (v: unknown, arg: unknown) => apply(v, arg, '*')
export const divided_by = (v: unknown, arg: unknown) => apply(v, arg, '/')
export const modulo = (v: unknown, arg: unknown) => apply(v, arg, '%')

/** BigDecimal's FloatDomainError, which Shopify/liquid passes through. */
function floatDomainError (n: number): never {
  throw new LiquidRuntimeError(Number.isNaN(n) ? "Computation results in 'NaN' (Not a Number)" : `Computation results in '${n}'`)
}

export function abs (v: unknown) {
  const n = toRubyNumber(v)
  if (n instanceof Decimal) return toLiquid(n.abs())
  return toLiquid(Math.abs(n))
}

export function ceil (v: unknown) {
  const n = toRubyNumber(v)
  if (n instanceof Decimal) return n.ceil()
  return isSpecial(n) ? floatDomainError(n) : n
}

export function floor (v: unknown) {
  const n = toRubyNumber(v)
  if (n instanceof Decimal) return n.floor()
  return isSpecial(n) ? floatDomainError(n) : n
}

/**
 * Integers round to integers. Floats round half away from zero; with
 * positive `digits` the result is a float, otherwise an integer.
 */
export function round (v: unknown, digits: unknown = 0) {
  const n = toRubyNumber(v)
  const d = Math.trunc(asDouble(toRubyNumber(digits))) || 0
  if (isSpecial(n)) return d > 0 ? new LiquidFloat(n) : floatDomainError(n)
  if (d > 0) return isInteger(n) ? n : toLiquid(n.round(d))
  const rounded = asDecimal(n).round(d)
  return Math.trunc(rounded.toNumber())
}

function compare (a: RubyNumber, b: RubyNumber) {
  if (isSpecial(a) || isSpecial(b)) return asDouble(a) - asDouble(b)
  return asDecimal(a).compare(asDecimal(b))
}

export function at_least (v: unknown, min: unknown) {
  const n = toRubyNumber(v)
  const m = toRubyNumber(min)
  return toLiquid(compare(m, n) > 0 ? m : n)
}

export function at_most (v: unknown, max: unknown) {
  const n = toRubyNumber(v)
  const m = toRubyNumber(max)
  return toLiquid(compare(m, n) < 0 ? m : n)
}

/** Sums items (or an item property), flattening nested arrays as Ruby's InputIterator does. */
export function * sum (this: FilterImpl, input: Scope[], property?: unknown): IterableIterator<unknown> {
  let total: RubyNumber = 0
  const items = toArray(input).flat(Infinity)
  for (const item of items) {
    const value = property === undefined || property === null
      ? item
      : (isArray(item) || (item && typeof item === 'object') ? yield this.context._getFromScope(item, stringify(property), false) : 0)
    const n = toRubyNumber(value)
    if (isInteger(total) && isInteger(n)) total += n
    else if (isSpecial(total) || isSpecial(n)) total = asDouble(total) + asDouble(n)
    else total = asDecimal(total).add(asDecimal(n))
  }
  return toLiquid(total)
}
