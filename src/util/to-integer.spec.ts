import { LiquidRuntimeError, toInteger } from '.'
import { Drop, EmptyDrop, NullDrop } from '../drop'

describe('util/toInteger', function () {
  it('should accept integer numbers and normalize -0', function () {
    expect(toInteger(0)).toBe(0)
    expect(Object.is(toInteger(-0), 0)).toBe(true)
    expect(toInteger(42)).toBe(42)
    expect(toInteger(-42)).toBe(-42)
  })

  it('should reject non-integer numbers', function () {
    for (const val of [1.5, -0.1, NaN, Infinity, -Infinity]) {
      expect(() => toInteger(val)).toThrow(LiquidRuntimeError)
      expect(() => toInteger(val)).toThrow('invalid integer')
    }
  })

  it('should parse decimal, octal, hex, and binary integer strings', function () {
    expect(toInteger('42')).toBe(42)
    expect(toInteger('-42')).toBe(-42)
    expect(toInteger('+42')).toBe(42)
    expect(toInteger('1_000_000')).toBe(1000000)
    expect(toInteger('0d10')).toBe(10)
    expect(toInteger('-0D0_9')).toBe(-9)
    expect(toInteger('0')).toBe(0)
    expect(Object.is(toInteger('-0'), 0)).toBe(true)
    expect(toInteger('010')).toBe(8)
    expect(toInteger('0o10')).toBe(8)
    expect(toInteger('-0O7_7')).toBe(-63)
    expect(toInteger('0x1f')).toBe(31)
    expect(toInteger('-0X1_A')).toBe(-26)
    expect(toInteger('0b1010')).toBe(10)
    expect(toInteger('-0B1_0')).toBe(-2)
  })

  it('should strip only ASCII whitespace around strings', function () {
    expect(toInteger(' \t\n\r\f\v42 \t\n\r\f\v')).toBe(42)
    expect(() => toInteger('\u00a042')).toThrow('invalid integer')
    expect(() => toInteger('42\u00a0')).toThrow('invalid integer')
    expect(() => toInteger('+ 1')).toThrow('invalid integer')
    expect(() => toInteger('- 1')).toThrow('invalid integer')
  })

  it('should reject malformed integer strings', function () {
    for (const val of ['', '+', '-', '08', '1.0', '1e2', '1_', '_1', '1__2', '0x', '0x_1', '0o', '0b2', 'abc']) {
      expect(() => toInteger(val)).toThrow(LiquidRuntimeError)
      expect(() => toInteger(val)).toThrow('invalid integer')
    }
  })

  it('should unwrap Drops and boxed primitives', function () {
    class ValueOfDrop extends Drop {
      valueOf () { return -3 }
    }
    class ToStringDrop extends Drop {
      toString () { return '15' }
    }
    class PlainDrop extends Drop {}

    expect(toInteger(new ValueOfDrop())).toBe(-3)
    expect(toInteger(new ToStringDrop())).toBe(15)
    expect(() => toInteger(new PlainDrop())).toThrow('invalid integer')
    expect(() => toInteger(new NullDrop())).toThrow('invalid integer')
    expect(() => toInteger(new EmptyDrop())).toThrow('invalid integer')

    expect(toInteger(Object(7))).toBe(7)
    expect(toInteger(Object('12'))).toBe(12)
    expect(() => toInteger(Object(true))).toThrow('invalid integer')
  })

  it('should reject nil, booleans, arrays, and plain objects', function () {
    for (const val of [null, undefined, true, false, [], [1], {}]) {
      expect(() => toInteger(val)).toThrow(LiquidRuntimeError)
      expect(() => toInteger(val)).toThrow('invalid integer')
    }
  })
})
