/**
 * Base64 related filters
 *
 * Implements base64_encode and base64_decode filters for Shopify compatibility
 */

import { FilterImpl } from '../template'
import { isKeyValuePair } from '../parser/filter-arg'
import { LiquidRuntimeError, stringify } from '../util'
import { base64Encode, base64Decode } from './base64-impl'

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

export function base64_encode (this: FilterImpl, value: string | Buffer, ...rawArgs: unknown[]): string {
  assertArity1(this, rawArgs)
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    this.context.memoryLimit.use(value.byteLength)
    return value.toString('base64')
  }
  const str = stringify(value)
  this.context.memoryLimit.use(str.length)
  return base64Encode(str)
}

export function base64_decode (this: FilterImpl, value: string, ...rawArgs: unknown[]): string {
  assertArity1(this, rawArgs)
  const str = stringify(value)
  this.context.memoryLimit.use(str.length)
  if (!isBase64(str)) throw new LiquidRuntimeError('invalid base64 provided to base64_decode')
  return base64Decode(str)
}

export function base64_url_safe_encode (this: FilterImpl, value: string | Buffer, ...rawArgs: unknown[]): string {
  assertArity1(this, rawArgs)
  return base64_encode.call(this, value).replace(/\+/g, '-').replace(/\//g, '_')
}

export function base64_url_safe_decode (this: FilterImpl, value: string, ...rawArgs: unknown[]): string {
  assertArity1(this, rawArgs)
  const str = stringify(value)
  this.context.memoryLimit.use(str.length)
  if (!isUrlSafeBase64(str)) throw new LiquidRuntimeError('invalid base64 provided to base64_url_safe_decode')
  return base64Decode(str.replace(/-/g, '+').replace(/_/g, '/'))
}

function isBase64 (str: string): boolean {
  str = str.replace(/[\t\n\f\r ]/g, '')
  if (str.length % 4 === 0) str = str.replace(/==?$/, '')
  return str.length % 4 !== 1 && /^[A-Za-z0-9+/]*$/.test(str)
}

function isUrlSafeBase64 (str: string): boolean {
  if (str.length % 4 === 0) str = str.replace(/==?$/, '')
  return str.length % 4 !== 1 && /^[A-Za-z0-9\-_]*$/.test(str)
}
