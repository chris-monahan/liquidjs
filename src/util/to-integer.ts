import { Drop } from '../drop/drop'
import { LiquidRuntimeError } from './error'

const ASCII_WHITESPACE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g
const DECIMAL_INT = /^(?:[1-9]|0[dD][0-9])(?:_?[0-9])*$/
const OCTAL_INT = /^(?:0[oO][0-7]|0)(?:_?[0-7])*$/
const HEX_INT = /^0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*$/
const BINARY_INT = /^0[bB][01](?:_?[01])*$/

export function toInteger (value: unknown): number {
  if (value instanceof Drop) {
    const v = typeof value.valueOf === 'function' ? value.valueOf() : value
    if (v !== value) {
      value = v
    } else if (
      typeof value.toString === 'function' &&
      value.toString !== Object.prototype.toString &&
      value.toString !== Drop.prototype.toString
    ) {
      value = value.toString()
    }
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    value = value.valueOf()
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value === 0 ? 0 : value
    throw new LiquidRuntimeError('invalid integer')
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(ASCII_WHITESPACE, '')
    let sign = 1
    let body = trimmed
    if (body.startsWith('-')) {
      sign = -1
      body = body.slice(1)
    } else if (body.startsWith('+')) {
      body = body.slice(1)
    }
    let radix = 0
    if (DECIMAL_INT.test(body)) {
      radix = 10
      if (body.startsWith('0')) body = body.slice(2)
    } else if (OCTAL_INT.test(body)) {
      radix = 8
      if (body.length > 1 && (body[1] === 'o' || body[1] === 'O')) body = body.slice(2)
    } else if (HEX_INT.test(body)) {
      radix = 16
      body = body.slice(2)
    } else if (BINARY_INT.test(body)) {
      radix = 2
      body = body.slice(2)
    } else {
      throw new LiquidRuntimeError('invalid integer')
    }
    const n = sign * parseInt(body.replace(/_/g, ''), radix)
    return n === 0 ? 0 : n
  }
  throw new LiquidRuntimeError('invalid integer')
}
