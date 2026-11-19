/**
 * String related filters
 *
 * * prefer stringify() to String() since `undefined`, `null` should eval ''
 */

// Han (Chinese) characters: \u4E00-\u9FFF
// Additional Han characters: \uF900-\uFAFF (CJK Compatibility Ideographs)
// Additional Han characters: \u3400-\u4DBF (CJK Unified Ideographs Extension A)
// Katakana (Japanese): \u30A0-\u30FF
// Hiragana (Japanese): \u3040-\u309F
// Hangul (Korean): \uAC00-\uD7AF
import { FilterImpl } from '../template'
import { isKeyValuePair } from '../parser/filter-arg'
import { advanceCodePoints, codePointLength, isNil, LiquidRuntimeError, stringify, toArray, toInteger, toValue } from '../util'

const rCJKWord = /[\u4E00-\u9FFF\uF900-\uFAFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/gu

// Word boundary followed by word characters (for detecting words)
const rNonCJKWord = /[^\u4E00-\u9FFF\uF900-\uFAFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\s]+/gu
const rLeadingAsciiSpace = /^[ \t\n\r\f\v]+/
const rTrailingAsciiSpace = /[ \t\n\r\f\v]+$/
const rAsciiSpaceRun = /[ \t\n\r\f\v]+/g
const MAX_I32 = 2147483647

function resolveFilterArgs (impl: FilterImpl | undefined, rawArgs: unknown[], min: number, max = min): unknown[] {
  let args: unknown[]
  const tokenArgs = impl?.token?.args
  if (tokenArgs && tokenArgs.length === rawArgs.length) {
    args = []
    let kwargs: Record<string, unknown> | undefined
    for (let i = 0; i < rawArgs.length; i++) {
      if (isKeyValuePair(tokenArgs[i])) {
        const [k, val] = rawArgs[i] as [string, unknown]
        if (!kwargs) kwargs = {}
        kwargs[k] = val
      } else {
        args.push(rawArgs[i])
      }
    }
    if (kwargs) args.push(kwargs)
  } else {
    args = rawArgs
  }
  const given = 1 + args.length
  if (given < min || given > max) {
    const expected = min === max ? String(min) : `${min}..${max}`
    throw new LiquidRuntimeError(`wrong number of arguments (given ${given}, expected ${expected})`)
  }
  return args
}

function splitAsciiWordsWithLimit (str: string, limit: number): string[] {
  const trimmed = str.replace(rLeadingAsciiSpace, '')
  if (!trimmed) return []
  const out: string[] = []
  let lastIndex = 0
  rAsciiSpaceRun.lastIndex = 0
  let match: RegExpExecArray | null
  while (out.length < limit - 1 && (match = rAsciiSpaceRun.exec(trimmed)) !== null) {
    out.push(trimmed.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length
  }
  out.push(trimmed.slice(lastIndex))
  return out
}

export function append (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [arg] = resolveFilterArgs(this, rawArgs, 2)
  const lhs = stringify(v)
  const rhs = stringify(arg)
  this.context.memoryLimit.use(lhs.length + rhs.length)
  return lhs + rhs
}

export function prepend (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [arg] = resolveFilterArgs(this, rawArgs, 2)
  const lhs = stringify(v)
  const rhs = stringify(arg)
  this.context.memoryLimit.use(lhs.length + rhs.length)
  return rhs + lhs
}

function getTrimStart (str: string, chars: Set<string>): number {
  let start = 0
  for (const char of str) {
    if (!chars.has(char)) break
    start += char.length
  }
  return start
}

function getTrimEnd (str: string, chars: Set<string>, start = 0): number {
  let end = str.length
  while (end > start) {
    const size = end - start >= 2 && str.codePointAt(end - 2)! > 0xFFFF ? 2 : 1
    if (!chars.has(str.slice(end - size, end))) break
    end -= size
  }
  return end
}

export function lstrip (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawChars] = resolveFilterArgs(this, rawArgs, 1, 2)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  if (rawChars) {
    const chars = stringify(rawChars)
    this.context.memoryLimit.use(chars.length)
    return str.slice(getTrimStart(str, new Set(chars)))
  }
  return str.trimStart()
}

export function downcase (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  resolveFilterArgs(this, rawArgs, 1)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return str.toLowerCase()
}

export function upcase (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  resolveFilterArgs(this, rawArgs, 1)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return stringify(str).toUpperCase()
}

export function remove (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawArg] = resolveFilterArgs(this, rawArgs, 2)
  const str = stringify(v)
  const arg = stringify(rawArg)
  this.context.memoryLimit.use(str.length + arg.length)
  return str.split(arg).join('')
}

export function remove_first (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawArg] = resolveFilterArgs(this, rawArgs, 2)
  const str = stringify(v)
  const l = stringify(rawArg)
  this.context.memoryLimit.use(str.length + l.length)
  return str.replace(l, '')
}

export function remove_last (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawArg] = resolveFilterArgs(this, rawArgs, 2)
  const str = stringify(v)
  const pattern = stringify(rawArg)
  this.context.memoryLimit.use(str.length + pattern.length)
  const index = str.lastIndexOf(pattern)
  if (index === -1) return str
  return str.substring(0, index) + str.substring(index + pattern.length)
}

export function rstrip (this: FilterImpl, str: string, ...rawArgs: unknown[]) {
  const [rawChars] = resolveFilterArgs(this, rawArgs, 1, 2)
  str = stringify(str)
  this.context.memoryLimit.use(str.length)
  if (rawChars) {
    const chars = stringify(rawChars)
    this.context.memoryLimit.use(chars.length)
    return str.slice(0, getTrimEnd(str, new Set(chars)))
  }
  return str.trimEnd()
}

export function split (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [arg] = resolveFilterArgs(this, rawArgs, 2)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  const sep = stringify(arg)
  if (sep === ' ') {
    const trimmed = str.replace(rLeadingAsciiSpace, '').replace(rTrailingAsciiSpace, '')
    return trimmed ? trimmed.split(/[ \t\n\r\f\v]+/) : []
  }
  const arr = str.split(sep)
  // align to ruby split, which is the behavior of shopify/liquid
  // see: https://ruby-doc.org/core-2.4.0/String.html#method-i-split
  while (arr.length && arr[arr.length - 1] === '') arr.pop()
  return arr
}

export function strip (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawChars] = resolveFilterArgs(this, rawArgs, 1, 2)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  if (rawChars) {
    const set = new Set(stringify(rawChars))
    this.context.memoryLimit.use(set.size)
    const start = getTrimStart(str, set)
    return str.slice(start, getTrimEnd(str, set, start))
  }
  return str.trim()
}

export function strip_newlines (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  resolveFilterArgs(this, rawArgs, 1)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return str.replace(/\r?\n/gm, '')
}

export function squish (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  resolveFilterArgs(this, rawArgs, 1)
  if (isNil(toValue(v))) return undefined
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return str.replace(/\s+/g, ' ').trim()
}

export function capitalize (this: FilterImpl, str: string, ...rawArgs: unknown[]) {
  resolveFilterArgs(this, rawArgs, 1)
  str = stringify(str)
  this.context.memoryLimit.use(str.length)
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function replace (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawPattern, rawReplacement] = resolveFilterArgs(this, rawArgs, 2, 3)
  const str = stringify(v)
  const pattern = stringify(rawPattern)
  const replacement = stringify(rawReplacement)
  if (pattern === '') {
    const chars = Array.from(str)
    const outputSize = str.length + (chars.length + 1) * replacement.length
    this.context.memoryLimit.use(outputSize)
    return chars.length ? replacement + chars.join(replacement) + replacement : replacement
  }
  const parts = str.split(pattern)
  const outputSize = str.length + (parts.length - 1) * (replacement.length - pattern.length)
  this.context.memoryLimit.use(outputSize)
  return parts.join(replacement)
}

export function replace_first (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawArg1, rawArg2] = resolveFilterArgs(this, rawArgs, 2, 3)
  const str = stringify(v)
  const arg1 = stringify(rawArg1)
  const arg2 = stringify(rawArg2)
  this.context.memoryLimit.use(str.length + arg1.length + arg2.length)
  return str.replace(arg1, () => arg2)
}

export function replace_last (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const [rawArg1, rawArg2] = resolveFilterArgs(this, rawArgs, 3)
  const str = stringify(v)
  const pattern = stringify(rawArg1)
  const replacement = stringify(rawArg2)
  this.context.memoryLimit.use(str.length + pattern.length + replacement.length)
  const index = str.lastIndexOf(pattern)
  if (index === -1) return str
  return str.substring(0, index) + replacement + str.substring(index + pattern.length)
}

export function truncate (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const args = resolveFilterArgs(this, rawArgs, 1, 3)
  if (isNil(toValue(v))) return undefined
  const str = stringify(v)
  const l = args.length >= 1 ? toInteger(args[0]) : 50
  const o = args.length >= 2 ? stringify(args[1]) : '...'
  this.context.memoryLimit.use(str.length + o.length)
  if (l >= 0 && (str.length <= l || advanceCodePoints(str, 0, l) >= str.length)) return str
  return str.slice(0, advanceCodePoints(str, 0, Math.max(l - codePointLength(o), 0))) + o
}

export function truncatewords (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  const args = resolveFilterArgs(this, rawArgs, 1, 3)
  if (isNil(toValue(v))) return undefined
  const str = stringify(v)
  let words = args.length >= 1 ? toInteger(args[0]) : 15
  if (words + 1 > MAX_I32) return str
  if (words <= 0) words = 1
  const wordlist = splitAsciiWordsWithLimit(str, words + 1)
  if (wordlist.length <= words) return str
  wordlist.pop()
  const o = args.length >= 2 ? stringify(args[1]) : '...'
  this.context.memoryLimit.use(str.length + o.length)
  return wordlist.join(' ') + o
}

export function normalize_whitespace (this: FilterImpl, v: string) {
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return str.replace(/\s+/g, ' ')
}

export function number_of_words (this: FilterImpl, input: string, mode?: 'cjk' | 'auto') {
  const str = stringify(input)
  this.context.memoryLimit.use(str.length)
  input = str.trim()
  if (!input) return 0
  switch (mode) {
    case 'cjk':
      // Count CJK characters and words
      return (input.match(rCJKWord) || []).length + (input.match(rNonCJKWord) || []).length
    case 'auto':
      // Count CJK characters, if none, count words
      return rCJKWord.test(input)
        ? input.match(rCJKWord)!.length + (input.match(rNonCJKWord) || []).length
        : input.split(/\s+/).length
    default:
      // Count words only
      return input.split(/\s+/).length
  }
}

export function array_to_sentence_string (this: FilterImpl, input: unknown, connector = 'and') {
  const array = toArray(input, this.context.memoryLimit)
  connector = stringify(connector)
  let outputSize = connector.length + array.length * 2
  for (let i = 0; i < array.length; i++) outputSize += stringify(array[i]).length
  this.context.memoryLimit.use(outputSize)
  switch (array.length) {
    case 0:
      return ''
    case 1:
      return array[0]
    case 2:
      return `${array[0]} ${connector} ${array[1]}`
    default:
      return `${array.slice(0, -1).join(', ')}, ${connector} ${array[array.length - 1]}`
  }
}
