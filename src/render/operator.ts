import { isComparable } from '../drop/comparable'
import { Context } from '../context'
import { LiquidRuntimeError, toValue } from '../util'
import { formatFloat, isLiquidFloat } from '../util/liquid-float'
import { isFalsy, isTruthy } from '../render/boolean'
import { hasOwnProperty, isArray, isFunction, isString, stringify } from '../util/underscore'
import { LiquidRange } from '../util/liquid-range'

const RUBY_FIXNUM_LIMIT = 4611686018427387904

function isPlainHash (val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object') return false
  const proto = Object.getPrototypeOf(val)
  return proto === null || proto === Object.prototype
}

function compareOrder (
  lRaw: unknown,
  rRaw: unknown,
  lResolved: unknown,
  rResolved: unknown,
  cmp: (a: number | string, b: number | string) => boolean
): boolean {
  const lVal = isLiquidFloat(lResolved) ? lResolved.value : lResolved
  const rVal = isLiquidFloat(rResolved) ? rResolved.value : rResolved
  const lIsFloat = isLiquidFloat(lRaw) || isLiquidFloat(lResolved) || (typeof lVal === 'number' && !Number.isInteger(lVal))
  const rIsFloat = isLiquidFloat(rRaw) || isLiquidFloat(rResolved) || (typeof rVal === 'number' && !Number.isInteger(rVal))
  if (typeof lVal === 'number' && typeof rVal === 'number') return cmp(lVal, rVal)
  if (typeof lVal === 'string' && typeof rVal === 'string') return cmp(lVal, rVal)
  if (typeof lVal === 'number' && typeof rVal === 'string') {
    throw new LiquidRuntimeError(`comparison of ${lIsFloat ? 'Float' : 'Integer'} with String failed`)
  }
  if (typeof lVal === 'string' && typeof rVal === 'number') {
    const rhsDesc = rIsFloat
      ? formatFloat(rVal)
      : (Math.abs(rVal) >= RUBY_FIXNUM_LIMIT ? 'Integer' : String(rVal))
    throw new LiquidRuntimeError(`comparison of String with ${rhsDesc} failed`)
  }
  return false
}

/**
 * A handler may return a `boolean` (legacy interface), a `Promise`, or a generator
 * that `yield`s to await async values. The render driver resolves all three, so
 * operators written against the legacy `=> boolean` signature keep working.
 */
export type OperatorGenerator = Generator<unknown, boolean, any>
export type OperatorResult = boolean | Promise<boolean> | OperatorGenerator
export type UnaryOperatorHandler = (operand: any, ctx: Context) => OperatorResult;
export type BinaryOperatorHandler = (lhs: any, rhs: any, ctx: Context) => OperatorResult;
export type OperatorHandler = UnaryOperatorHandler | BinaryOperatorHandler;
export type Operators = Record<string, OperatorHandler>

export const defaultOperators: Operators = {
  '==': function * (l: any, r: any): OperatorGenerator { return yield equals(l, r) },
  '!=': function * (l: any, r: any): OperatorGenerator { return !(yield equals(l, r)) },
  '>': function * (l: any, r: any): OperatorGenerator {
    if (isComparable(l) && !isLiquidFloat(l)) return yield l.gt(r)
    if (isComparable(r) && !isLiquidFloat(r)) return yield r.lt(l)
    return compareOrder(l, r, yield toValue(l), yield toValue(r), (a, b) => a > b)
  },
  '<': function * (l: any, r: any): OperatorGenerator {
    if (isComparable(l) && !isLiquidFloat(l)) return yield l.lt(r)
    if (isComparable(r) && !isLiquidFloat(r)) return yield r.gt(l)
    return compareOrder(l, r, yield toValue(l), yield toValue(r), (a, b) => a < b)
  },
  '>=': function * (l: any, r: any): OperatorGenerator {
    if (isComparable(l) && !isLiquidFloat(l)) return yield l.geq(r)
    if (isComparable(r) && !isLiquidFloat(r)) return yield r.leq(l)
    return compareOrder(l, r, yield toValue(l), yield toValue(r), (a, b) => a >= b)
  },
  '<=': function * (l: any, r: any): OperatorGenerator {
    if (isComparable(l) && !isLiquidFloat(l)) return yield l.leq(r)
    if (isComparable(r) && !isLiquidFloat(r)) return yield r.geq(l)
    return compareOrder(l, r, yield toValue(l), yield toValue(r), (a, b) => a <= b)
  },
  'contains': function * (l: any, r: any): OperatorGenerator {
    l = yield toValue(l)
    const rVal = yield toValue(r)
    if (l == null || l === false || rVal == null || rVal === false) return false
    if (isString(l)) return l.includes(stringify(rVal))
    if (isArray(l)) return yield arrayIncludes(l, r)
    if (l instanceof LiquidRange) return l.includes(rVal)
    if (isPlainHash(l)) return isString(rVal) && hasOwnProperty.call(l, rVal)
    if (isFunction(l?.indexOf)) return l.indexOf(rVal) > -1
    return false
  },
  'not': function * (v: any, ctx: Context): OperatorGenerator { return isFalsy(yield toValue(v), ctx) },
  'and': function * (l: any, r: any, ctx: Context): OperatorGenerator { return isTruthy(yield toValue(l), ctx) && isTruthy(yield toValue(r), ctx) },
  'or': function * (l: any, r: any, ctx: Context): OperatorGenerator { return isTruthy(yield toValue(l), ctx) || isTruthy(yield toValue(r), ctx) }
}

export function * equals (lhs: any, rhs: any): Generator<unknown, boolean, any> {
  if (isComparable(lhs)) return yield lhs.equals(rhs)
  if (isComparable(rhs)) return yield rhs.equals(lhs)
  lhs = yield toValue(lhs)
  rhs = yield toValue(rhs)
  if (isArray(lhs)) {
    return isArray(rhs) && (yield arrayEquals(lhs, rhs))
  }
  return lhs === rhs
}

function * arrayEquals (lhs: any[], rhs: any[]): Generator<unknown, boolean, any> {
  if (lhs.length !== rhs.length) return false
  for (let i = 0; i < lhs.length; i++) {
    if (!(yield equals(lhs[i], rhs[i]))) return false
  }
  return true
}

export function * arrayIncludes (arr: any[], item: any): Generator<unknown, boolean, any> {
  for (const value of arr) {
    if (yield equals(value, item)) return true
  }
  return false
}
