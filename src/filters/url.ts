import { FilterImpl } from '../template'
import { isKeyValuePair } from '../parser/filter-arg'
import { LiquidRuntimeError } from '../util/error'
import { isNil, stringify, toValue } from '../util/underscore'

const rPercentEscapes = /(?:%[0-9A-Fa-f]{2})+/g

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

export function url_decode (this: FilterImpl | void, x: string, ...rawArgs: unknown[]): string | null {
  assertArity1(this, rawArgs)
  if (isNil(toValue(x))) return null
  const str = stringify(x)
  this?.context?.memoryLimit.use(str.length)
  return str
    .replace(/\+/g, ' ')
    .replace(rPercentEscapes, m => {
      try {
        return decodeURIComponent(m)
      } catch {
        throw new LiquidRuntimeError('invalid byte sequence in UTF-8')
      }
    })
}

export function url_encode (this: FilterImpl | void, x: string, ...rawArgs: unknown[]): string | null {
  assertArity1(this, rawArgs)
  if (isNil(toValue(x))) return null
  const str = stringify(x)
  this?.context?.memoryLimit.use(str.length)
  return encodeURIComponent(str).replace(/%20/g, '+')
}
export const cgi_escape = (x: string) => encodeURIComponent(stringify(x))
  .replace(/%20/g, '+')
  .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
export const uri_escape = (x: string) => encodeURI(stringify(x))
  .replace(/%5B/g, '[')
  .replace(/%5D/g, ']')

const rSlugifyDefault = /[^\p{M}\p{L}\p{Nd}]+/ug
const rSlugifyReplacers = {
  'raw': /\s+/g,
  'default': rSlugifyDefault,
  'pretty': /[^\p{M}\p{L}\p{Nd}._~!$&'()+,;=@]+/ug,
  'ascii': /[^A-Za-z0-9]+/g,
  'latin': rSlugifyDefault,
  'none': null
}

export function slugify (str: string, mode: keyof typeof rSlugifyReplacers = 'default', cased = false): string {
  str = stringify(str)

  const replacer = rSlugifyReplacers[mode]
  if (replacer) {
    if (mode === 'latin') str = removeAccents(str)
    str = str.replace(replacer, '-').replace(/^-|-$/g, '')
  }

  return cased ? str : str.toLowerCase()
}

function removeAccents (str: string): string {
  return str.replace(/[àáâãäå]/g, 'a')
    .replace(/[æ]/g, 'ae')
    .replace(/[ç]/g, 'c')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[ð]/g, 'd')
    .replace(/[ñ]/g, 'n')
    .replace(/[òóôõöø]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[ß]/g, 'ss')
    .replace(/[œ]/g, 'oe')
    .replace(/[þ]/g, 'th')
    .replace(/[ẞ]/g, 'SS')
    .replace(/[Œ]/g, 'OE')
    .replace(/[Þ]/g, 'TH')
}
