import { FilterImpl } from '../template'
import { isKeyValuePair } from '../parser/filter-arg'
import { LiquidRuntimeError } from '../util/error'
import { isNil, stringify, toValue } from '../util/underscore'

const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

const rEscapeOnce = /["><']|&(?!([a-zA-Z]+|(#\d+));)/g

function assertArity1 (impl: FilterImpl | void, rawArgs: unknown[]) {
  const tokenArgs = impl?.token?.args
  let extra = rawArgs.length
  if (Array.isArray(tokenArgs) && tokenArgs.length === rawArgs.length) {
    let pos = 0
    let hasKw = false
    for (let i = 0; i < tokenArgs.length; i++) {
      if (isKeyValuePair(tokenArgs[i])) hasKw = true
      else pos++
    }
    extra = pos + (hasKw ? 1 : 0)
  }
  if (extra > 0) {
    throw new LiquidRuntimeError(`wrong number of arguments (given ${1 + extra}, expected 1)`)
  }
}

export function escape (this: FilterImpl | void, str: string, ...rawArgs: unknown[]): string | null {
  assertArity1(this, rawArgs)
  if (isNil(toValue(str))) return null
  str = stringify(str)
  this?.context?.memoryLimit.use(str.length)
  return str.replace(/&|<|>|"|'/g, m => escapeMap[m])
}

export const h = escape

export function xml_escape (this: FilterImpl, str: string) {
  str = stringify(str)
  this.context.memoryLimit.use(str.length)
  return str.replace(/&|<|>|"|'/g, m => escapeMap[m])
}

export function escape_once (this: FilterImpl, str: string, ...rawArgs: unknown[]) {
  assertArity1(this, rawArgs)
  str = stringify(str)
  this.context.memoryLimit.use(str.length)
  return str.replace(rEscapeOnce, m => escapeMap[m])
}

export function newline_to_br (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  assertArity1(this, rawArgs)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return str.replace(/\r?\n/gm, '<br />\n')
}

function stripHtmlPass (str: string, blocks: Map<string, string>): string {
  let out = ''
  let i = 0
  while (i < str.length) {
    if (blocks.size === 0) return out + str.slice(i)
    const lt = str.indexOf('<', i)
    if (lt < 0) return out + str.slice(i)
    out += str.slice(i, lt)
    let matched = false
    for (const [opener, closer] of blocks) {
      if (!str.startsWith(opener, lt)) continue
      const e = str.indexOf(closer, lt + opener.length)
      if (e >= 0) {
        i = e + closer.length
        matched = true
        break
      }
      blocks.delete(opener)
    }
    if (!matched) {
      out += '<'
      i = lt + 1
    }
  }
  return out
}

// Raw-text blocks (HTML5) in pass 1, then '<...>' in pass 2; a regex
// equivalent is O(n^2) in V8 on unclosed openers.
export function strip_html (this: FilterImpl, v: string, ...rawArgs: unknown[]) {
  assertArity1(this, rawArgs)
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  const withoutBlocks = stripHtmlPass(str, new Map([['<script', '</script>'], ['<style', '</style>'], ['<!--', '-->']]))
  return stripHtmlPass(withoutBlocks, new Map([['<', '>']]))
}
