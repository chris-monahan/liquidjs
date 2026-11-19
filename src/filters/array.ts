import { toArray, argumentsToValue, toValue, toLiquid, stringify, caseInsensitiveCompare, orderedCompare, isArray, isNil, isString, isFunction, isIterable, isPropertyAccessToken, readArrayElement, readFirst, readLast, readSize, toEnumerable, advanceCodePoints, codePointLength, assert, Limiter, LiquidRuntimeError } from '../util'
import { arrayIncludes, equals, evalToken, evalTokenValue, isTruthy } from '../render'
import { Value, FilterImpl } from '../template'
import { Tokenizer } from '../parser'
import { readJSProperty, Scope } from '../context'
import { Drop, EmptyDrop } from '../drop'

function isPlainObject (val: unknown): val is Record<string, unknown> {
  if (typeof val !== 'object' || val === null || isArray(val) || val instanceof Drop) return false
  const proto = Object.getPrototypeOf(val)
  return proto === null || proto === Object.prototype || proto?.constructor === Object
}

function flatten (arr: any[], out: any[], limiter?: Limiter): any[] {
  for (const el of arr) {
    const v = toValue(el)
    if (isArray(v)) {
      limiter?.use(1)
      flatten(v, out, limiter)
    } else {
      limiter?.use(1)
      out.push(el)
    }
  }
  return out
}

function toInputArray (val: unknown, limiter?: Limiter): any[] {
  val = toValue(toLiquid(val))
  if (isNil(val)) return []
  if (isArray(val)) {
    if (val.every(el => !isArray(toValue(el)))) return val
    return flatten(val, [], limiter)
  }
  if (isString(val)) return [val]
  if (isPlainObject(val)) return [val]
  if (isIterable(val)) {
    const arr: any[] = []
    for (const item of val) {
      limiter?.use(1)
      arr.push(item)
    }
    return arr
  }
  return [val]
}

function respondToBrackets (u: unknown): boolean {
  u = toLiquid(toValue(toLiquid(u)))
  if (typeof u === 'string') return true
  if (typeof u === 'number' && Number.isInteger(u)) return true
  if (isArray(u) || u instanceof Drop || isPlainObject(u)) return true
  return false
}

function rubyInspect (v: unknown): string {
  v = toValue(toLiquid(v))
  if (isNil(v)) return 'nil'
  if (typeof v === 'string') return JSON.stringify(v)
  return rubyToS(v)
}

function rubyToS (v: unknown): string {
  v = toValue(toLiquid(v))
  if (isNil(v)) return ''
  if (isArray(v)) return '[' + v.map(rubyInspect).join(', ') + ']'
  if (isPlainObject(v)) {
    return '{' + Object.entries(v).map(([k, val]) => `${rubyInspect(k)}=>${rubyInspect(val)}`).join(', ') + '}'
  }
  return stringify(v)
}

function extractNumber (v: unknown): number | undefined {
  v = toValue(toLiquid(v))
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'object' && v !== null && !isArray(v) && !isPlainObject(v) && !(v instanceof Drop) && !(v instanceof Date) && typeof (v as { valueOf?: unknown }).valueOf === 'function') {
    const n = (v as { valueOf(): unknown }).valueOf()
    if (typeof n === 'number') return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function * selectFilterProperty (this: FilterImpl, item: unknown, prop: unknown): Generator<unknown, unknown, unknown> {
  const raw = toLiquid(item)
  const u = raw instanceof EmptyDrop ? '' : toLiquid(yield toValue(raw))
  const p = yield toValue(toLiquid(prop))
  if (typeof u === 'string') {
    if (typeof p === 'string') return u.includes(p) ? p : null
    const num = extractNumber(p)
    if (num !== undefined) {
      const idx = Math.trunc(num)
      const len = codePointLength(u)
      const norm = idx < 0 ? len + idx : idx
      if (norm < 0 || norm >= len) return null
      const start = advanceCodePoints(u, 0, norm)
      return u.slice(start, advanceCodePoints(u, start, 1))
    }
    throw new LiquidRuntimeError(`cannot select the property '${rubyToS(p)}'`)
  }
  if (typeof u === 'number' && Number.isInteger(u)) {
    const num = extractNumber(p)
    if (num !== undefined) {
      const idx = Math.trunc(num)
      if (idx < 0) return 0
      if (idx >= 53) return u < 0 ? 1 : 0
      return ((Math.floor(u / Math.pow(2, idx)) % 2) + 2) % 2
    }
    throw new LiquidRuntimeError(`cannot select the property '${rubyToS(p)}'`)
  }
  if (isArray(u)) {
    const num = extractNumber(p)
    if (num !== undefined) {
      const idx = Math.trunc(num)
      return readArrayElement(u, idx, this.context.ownPropertyOnly) ?? null
    }
    throw new LiquidRuntimeError(`cannot select the property '${rubyToS(p)}'`)
  }
  if (isNil(p)) return null
  if (p === '') {
    if (u instanceof Drop) return yield this.context.readProperty(u as Scope, '')
    const val = readJSProperty(u as Scope, '', this.context.ownPropertyOnly)
    return isFunction(val) ? yield val.call(u) : val
  }
  const k = stringify(p)
  if (isPlainObject(u)) {
    const direct = readJSProperty(u as Scope, k, this.context.ownPropertyOnly)
    if (direct !== undefined || Object.prototype.hasOwnProperty.call(u, k)) {
      return isFunction(direct) ? yield direct.call(u) : direct
    }
  }
  if (k.includes('.') || k.includes('[')) {
    let token
    let atEnd = false
    try {
      const tokenizer = new Tokenizer(k)
      token = tokenizer.readScopeValue()
      atEnd = tokenizer.end()
    } catch {
      token = undefined
    }
    if (token && atEnd && isPropertyAccessToken(token)) {
      const props: (string | number | Drop)[] = []
      for (const propToken of token.props) {
        props.push((yield evalTokenValue(propToken, this.context, false)) as unknown as string | number | Drop)
      }
      return yield this.context._getFromScope(u, props, false)
    }
  }
  if (u instanceof Drop) return yield this.context.readProperty(u as Scope, k)
  const val = readJSProperty(u as Scope, k, this.context.ownPropertyOnly)
  return isFunction(val) ? yield val.call(u) : val
}

function * readDirectBracketProperty (this: FilterImpl, item: unknown, prop: unknown): Generator<unknown, unknown, unknown> {
  const raw = toLiquid(item)
  if (raw instanceof EmptyDrop) return null
  const u = toLiquid(toValue(raw))
  const p = toValue(toLiquid(prop))
  if (typeof u === 'string') {
    const k = stringify(p)
    return u.includes(k) ? k : null
  }
  if ((typeof u === 'number' && Number.isInteger(u)) || isArray(u)) {
    throw new LiquidRuntimeError(`cannot select the property '${rubyToS(prop)}'`)
  }
  const k = stringify(p)
  if (u instanceof Drop) return yield this.context.readProperty(u as Scope, k)
  const val = readJSProperty(u as Scope, k, this.context.ownPropertyOnly)
  return isFunction(val) ? yield val.call(u) : val
}

function structuralKey (v: unknown, limiter: Limiter, ancestors: Set<object>, dropIds: WeakMap<object, number>, nextId: { n: number }): string {
  v = toValue(toLiquid(v))
  if (isNil(v)) return 'N'
  if (typeof v === 'boolean') return v ? 'T' : 'F'
  if (typeof v === 'number') return '#' + String(v)
  if (typeof v === 'string') return '$' + JSON.stringify(v)
  if (typeof v === 'object' && v !== null) {
    if (ancestors.has(v)) return '@'
    if (isArray(v)) {
      limiter.use(v.length + 1)
      ancestors.add(v)
      const s = '[' + v.map(el => structuralKey(el, limiter, ancestors, dropIds, nextId)).join(',') + ']'
      ancestors.delete(v)
      return s
    }
    if (isPlainObject(v)) {
      const obj = v
      const keys = Object.keys(obj).sort()
      limiter.use(keys.length + 1)
      ancestors.add(obj)
      const s = '{' + keys.map(k => `${JSON.stringify(k)}:${structuralKey(obj[k], limiter, ancestors, dropIds, nextId)}`).join(',') + '}'
      ancestors.delete(obj)
      return s
    }
    let id = dropIds.get(v)
    if (id === undefined) {
      id = ++nextId.n
      dropIds.set(v, id)
    }
    return 'O' + id
  }
  return '?' + String(v)
}

function addUniqKey (raw: unknown, seen: Set<unknown>, structSeen: Set<string>, limiter: Limiter, dropIds: WeakMap<object, number>, nextId: { n: number }): boolean {
  let val: unknown = toValue(toLiquid(raw))
  if (isNil(val)) val = null
  if (isArray(val) || isPlainObject(val)) {
    const sk = structuralKey(val, limiter, new Set(), dropIds, nextId)
    if (structSeen.has(sk)) return false
    structSeen.add(sk)
    return true
  }
  if (seen.has(val)) return false
  seen.add(val)
  return true
}

export const join = argumentsToValue(function (this: FilterImpl, v: any[], arg: string) {
  const array = toInputArray(v, this.context.memoryLimit)
  const sep = isNil(arg) ? ' ' : stringify(arg)
  let outputSize = sep.length * Math.max(array.length - 1, 0)
  for (let i = 0; i < array.length; i++) outputSize += stringify(array[i]).length
  this.context.memoryLimit.use(outputSize)
  return array.map(stringify).join(sep)
})
export const last = argumentsToValue(function (this: FilterImpl, v: any) {
  return readLast(v, this.context.ownPropertyOnly) ?? null
})
export const first = argumentsToValue(function (this: FilterImpl, v: any) {
  return readFirst(v, this.context.ownPropertyOnly) ?? null
})
export const reverse = argumentsToValue(function (this: FilterImpl, v: any[]) {
  const array = toInputArray(v, this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  return [...array].reverse()
})

function * sortBy (this: FilterImpl, arr: unknown, property: unknown, comparator: (a: unknown, b: unknown) => number): IterableIterator<unknown> {
  const array = toInputArray(yield toValue(toLiquid(arr)), this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  if (!array.length) return []
  const prop = yield toValue(toLiquid(property))
  const hasProperty = !isNil(prop)
  if (hasProperty && !array.every(respondToBrackets)) return null
  if (array.length <= 1) return [...array]
  const values: [unknown, unknown][] = []
  for (const item of array) {
    values.push([
      item,
      hasProperty
        ? yield toValue(yield * selectFilterProperty.call(this, item, prop))
        : yield toValue(toLiquid(item))
    ])
  }
  return values.sort((lhs, rhs) => comparator(lhs[1], rhs[1])).map(tuple => tuple[0])
}

export function * sort<T> (this: FilterImpl, arr: T[], property?: unknown): IterableIterator<unknown> {
  return yield * sortBy.call(this, arr, property, orderedCompare)
}

export function * sort_natural<T> (this: FilterImpl, arr: T[], property?: unknown): IterableIterator<unknown> {
  return yield * sortBy.call(this, arr, property, caseInsensitiveCompare)
}

export const size = argumentsToValue((v: any) => readSize(v) ?? 0)

export function * map (this: FilterImpl, arr: Scope[], property: unknown): IterableIterator<unknown> {
  if (arguments.length < 2) throw new LiquidRuntimeError('wrong number of arguments (given 1, expected 2)')
  const results = []
  const array = toInputArray(yield toValue(toLiquid(arr)), this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  const prop = yield toValue(toLiquid(property))
  for (let item of array) {
    if (isFunction(item)) item = yield item()
    if (prop === 'to_liquid') {
      const v = toLiquid(item)
      results.push(v === undefined ? null : v)
    } else if (!respondToBrackets(item)) {
      results.push(null)
    } else {
      const v = yield * selectFilterProperty.call(this, item, prop)
      results.push(v === undefined ? null : v)
    }
  }
  return results
}

export function * sum (this: FilterImpl, arr: Scope[], property?: string): IterableIterator<unknown> {
  let sum = 0
  const array = toArray(arr, this.context.memoryLimit)
  for (const item of array) {
    const data = Number(property ? yield this.context._getFromScope(item, stringify(property), false) : item)
    sum += Number.isNaN(data) ? 0 : data
  }
  return sum
}

export function * compact (this: FilterImpl, arr: unknown, property?: unknown): IterableIterator<unknown> {
  const array = toInputArray(arr, this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  if (arguments.length < 2 || isNil(toValue(toLiquid(property)))) {
    return array.filter(x => !isNil(toValue(toLiquid(x))))
  }
  if (!array.length) return []
  const result = []
  for (const item of array) {
    if (!respondToBrackets(item)) return null
    const val = yield * readDirectBracketProperty.call(this, item, property)
    if (!isNil(toValue(toLiquid(val)))) result.push(item)
  }
  return result
}

export function concat<T1, T2> (this: FilterImpl, v: T1[], arg: T2[] = []): (T1 | T2)[] {
  const lhs = toInputArray(v, this.context.memoryLimit)
  const argVal = toValue(toLiquid(arg))
  let rhs: T2[]
  if (isNil(argVal)) {
    rhs = []
  } else if (isArray(argVal)) {
    rhs = argVal
  } else if (isIterable(argVal)) {
    rhs = []
    for (const item of argVal) {
      this.context.memoryLimit.use(1)
      rhs.push(item)
    }
  } else {
    assert(false, 'concat filter requires an array argument')
    rhs = []
  }
  this.context.memoryLimit.use(lhs.length + rhs.length)
  return Array.prototype.concat.call(lhs, rhs)
}

export function push<T> (this: FilterImpl, v: T[], arg: T): T[] {
  return concat.call(this, v, [arg]) as T[]
}

export function unshift<T> (this: FilterImpl, v: T[], arg: T): T[] {
  const array = toArray(v, this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  const clone = [...array]
  clone.unshift(arg)
  return clone
}

export function pop<T> (this: FilterImpl, v: T[]): T[] {
  const array = toArray(v, this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  const clone = [...array]
  clone.pop()
  return clone
}

export function shift<T> (this: FilterImpl, v: T[]): T[] {
  const array = toArray(v, this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  const clone = [...array]
  clone.shift()
  return clone
}

function parseSliceInteger (value: unknown): number {
  value = toLiquid(value)
  if (value instanceof Drop) {
    const unwrapped = isFunction(value.valueOf) ? value.valueOf() : value
    if (unwrapped !== value) value = unwrapped
    else if (isFunction(value.toString) && value.toString !== Object.prototype.toString) value = value.toString()
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    value = value.valueOf()
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value === 0 ? 0 : value
    throw new LiquidRuntimeError('invalid integer')
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '')
    const match = /^([+-]?)(?:0[xX]([0-9a-fA-F](?:_?[0-9a-fA-F])*)|0[bB]([01](?:_?[01])*)|0[oO]([0-7](?:_?[0-7])*)|0[dD]([0-9](?:_?[0-9])*)|0((?:_?[0-7])*)|([1-9](?:_?[0-9])*))$/.exec(trimmed)
    if (!match) throw new LiquidRuntimeError('invalid integer')
    const sign = match[1] === '-' ? -1 : 1
    let mag: number
    if (match[2] !== undefined) mag = parseInt(match[2].replace(/_/g, ''), 16)
    else if (match[3] !== undefined) mag = parseInt(match[3].replace(/_/g, ''), 2)
    else if (match[4] !== undefined) mag = parseInt(match[4].replace(/_/g, ''), 8)
    else if (match[5] !== undefined) mag = parseInt(match[5].replace(/_/g, ''), 10)
    else if (match[6] !== undefined) mag = parseInt('0' + match[6].replace(/_/g, ''), 8)
    else mag = parseInt(match[7].replace(/_/g, ''), 10)
    const n = sign * mag
    if (n > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER
    if (n < -Number.MAX_SAFE_INTEGER) return -Number.MAX_SAFE_INTEGER
    return n === 0 ? 0 : n
  }
  throw new LiquidRuntimeError('invalid integer')
}

export function * slice<T> (this: FilterImpl, v: T[] | string, offset?: unknown, length?: unknown): IterableIterator<unknown> {
  if (arguments.length < 2) throw new LiquidRuntimeError('wrong number of arguments (given 1, expected 2..3)')
  if (arguments.length > 3) throw new LiquidRuntimeError(`wrong number of arguments (given ${arguments.length}, expected 2..3)`)
  let begin = parseSliceInteger(yield toValue(toLiquid(offset)))
  let rawLen: unknown = yield toValue(toLiquid(length))
  if (rawLen instanceof Boolean) rawLen = rawLen.valueOf()
  const len = (arguments.length < 3 || isNil(rawLen) || rawLen === false) ? 1 : parseSliceInteger(rawLen)
  const rawInput = yield toValue(toLiquid(v))
  const input: T[] | string = isArray(rawInput) ? rawInput : stringify(rawInput)
  const total = isArray(input) ? input.length : codePointLength(input)
  begin = begin < 0 ? total + begin : begin
  if (begin < 0 || begin > total || len < 0) return isArray(input) ? [] : ''
  const clampedLen = Math.min(len, total - begin)
  this.context.memoryLimit.use(clampedLen)
  if (isArray(input)) return Array.prototype.slice.call(input, begin, begin + clampedLen)
  const start = advanceCodePoints(input, 0, begin)
  return input.slice(start, advanceCodePoints(input, start, clampedLen))
}

function * matches (this: FilterImpl, value: unknown, expected: unknown): Generator<unknown, boolean, any> {
  if (this.context.opts.jekyllWhere) {
    if (EmptyDrop.is(expected)) return yield equals(value, expected)
    if (isArray(value)) return yield arrayIncludes(value, expected)
    return yield equals(value, expected)
  }
  if (expected === undefined) return isTruthy(value, this.context)
  return yield equals(value, expected)
}

function * filter (this: FilterImpl, include: boolean, arr: unknown, property: unknown, expected: any): IterableIterator<unknown> {
  const array = toInputArray(yield toValue(toLiquid(arr)), this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  if (!array.length) return []
  const result: unknown[] = []
  for (const item of array) {
    if (!respondToBrackets(item)) return null
    const value = yield * selectFilterProperty.call(this, item, property)
    if ((yield matches.call(this, value, expected)) === include) result.push(item)
  }
  return result
}

function * filter_exp<T extends object> (this: FilterImpl, include: boolean, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  const filtered: unknown[] = []
  const keyTemplate = new Value(stringify(exp), this.liquid)
  const array = toArray(arr, this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  for (const item of array) {
    this.context.push({ [itemName]: item })
    const value = yield keyTemplate.value(this.context)
    this.context.pop()
    if (value === include) filtered.push(item)
  }
  return filtered
}

export function * where<T extends object> (this: FilterImpl, arr: T[], property?: unknown, expected?: any): IterableIterator<unknown> {
  if (arguments.length < 2) return []
  return yield * filter.call(this, true, arr, property, expected)
}

export function * reject<T extends object> (this: FilterImpl, arr: T[], property?: unknown, expected?: any): IterableIterator<unknown> {
  if (arguments.length < 2) return toInputArray(yield toValue(toLiquid(arr)), this.context.memoryLimit)
  return yield * filter.call(this, false, arr, property, expected)
}

export function * where_exp<T extends object> (this: FilterImpl, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  return yield * filter_exp.call(this, true, arr, itemName, exp)
}

export function * reject_exp<T extends object> (this: FilterImpl, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  return yield * filter_exp.call(this, false, arr, itemName, exp)
}

export function * group_by<T extends object> (this: FilterImpl, arr: T[], property: string): IterableIterator<unknown> {
  const map = new Map()
  arr = toEnumerable(arr, this.context.memoryLimit)
  const token = new Tokenizer(stringify(property)).readScopeValue()
  this.context.memoryLimit.use(arr.length)
  for (const item of arr) {
    const key = yield evalToken(token, this.context.spawn(item))
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
}

export function * group_by_exp<T extends object> (this: FilterImpl, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  const map = new Map()
  const keyTemplate = new Value(stringify(exp), this.liquid)
  arr = toEnumerable(arr, this.context.memoryLimit)
  this.context.memoryLimit.use(arr.length)
  for (const item of arr) {
    this.context.push({ [itemName]: item })
    const key = yield keyTemplate.value(this.context)
    this.context.pop()
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
}

function * search (this: FilterImpl, arr: unknown, property: unknown, expected?: any): Generator<unknown, [number, unknown] | null | undefined, unknown> {
  const array = toInputArray(yield toValue(toLiquid(arr)), this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  for (let index = 0; index < array.length; index++) {
    const item = array[index]
    if (!respondToBrackets(item)) return null
    const value = yield * selectFilterProperty.call(this, item, property)
    if (yield matches.call(this, value, expected)) return [index, item]
  }
  return undefined
}

function * search_exp<T extends object> (this: FilterImpl, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  const predicate = new Value(stringify(exp), this.liquid)
  const array = toArray(arr, this.context.memoryLimit)
  for (let index = 0; index < array.length; index++) {
    this.context.push({ [itemName]: array[index] })
    const value = yield predicate.value(this.context)
    this.context.pop()
    if (value) return [index, array[index]]
  }
}

export function * has<T extends object> (this: FilterImpl, arr: T[], property: unknown, expected?: any): IterableIterator<unknown> {
  if (arguments.length < 2) throw new LiquidRuntimeError('wrong number of arguments (given 1, expected 2..3)')
  const result = yield * search.call(this, arr, property, expected)
  return result === null ? null : !!result
}

export function * has_exp<T extends object> (this: FilterImpl, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  const result = yield * search_exp.call(this, arr, itemName, exp)
  return !!result
}

export function * find_index<T extends object> (this: FilterImpl, arr: T[], property: unknown, expected?: any): IterableIterator<unknown> {
  if (arguments.length < 2) throw new LiquidRuntimeError('wrong number of arguments (given 1, expected 2..3)')
  const result = yield * search.call(this, arr, property, expected)
  return result ? result[0] : null
}

export function * find_index_exp<T extends object> (this: FilterImpl, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  const result = yield * search_exp.call(this, arr, itemName, exp)
  return result ? result[0] : undefined
}

export function * find<T extends object> (this: FilterImpl, arr: T[], property: unknown, expected?: any): IterableIterator<unknown> {
  if (arguments.length < 2) throw new LiquidRuntimeError('wrong number of arguments (given 1, expected 2..3)')
  const result = yield * search.call(this, arr, property, expected)
  return result ? result[1] : null
}

export function * find_exp<T extends object> (this: FilterImpl, arr: T[], itemName: string, exp: string): IterableIterator<unknown> {
  const result = yield * search_exp.call(this, arr, itemName, exp)
  return result ? result[1] : undefined
}

export function * uniq (this: FilterImpl, arr: unknown, property?: unknown): IterableIterator<unknown> {
  const array = toInputArray(arr, this.context.memoryLimit)
  this.context.memoryLimit.use(array.length)
  const seen = new Set<unknown>()
  const structSeen = new Set<string>()
  const dropIds = new WeakMap<object, number>()
  const nextId = { n: 0 }
  if (arguments.length < 2 || isNil(toValue(toLiquid(property)))) {
    const result = []
    for (const x of array) {
      if (addUniqKey(x, seen, structSeen, this.context.memoryLimit, dropIds, nextId)) {
        result.push(x)
      }
    }
    return result
  }
  if (array.length <= 1) return [...array]
  const result = []
  for (const item of array) {
    if (!respondToBrackets(item)) return null
    const val = yield * readDirectBracketProperty.call(this, item, property)
    if (addUniqKey(val, seen, structSeen, this.context.memoryLimit, dropIds, nextId)) {
      result.push(item)
    }
  }
  return result
}

export function sample<T> (this: FilterImpl, v: T[] | string, count = 1): T | string | (T | string)[] {
  v = toValue(v)
  if (isNil(v)) return []
  if (!isArray(v)) v = stringify(v)
  this.context.memoryLimit.use(v.length)
  const shuffled = [...v].sort(() => Math.random() - 0.5)
  if (count === 1) return shuffled[0]
  return shuffled.slice(0, count)
}
