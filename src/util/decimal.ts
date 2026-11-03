/**
 * Exact decimal arithmetic, standing in for the BigDecimal that Shopify/liquid
 * converts floats to before doing maths (`0.1 | plus: 0.2` is `0.3` there).
 * The value is `coef * 10^exp`. BigInt has no -0, so a zero's sign is kept
 * separately: Ruby prints `0 * -1.5` as `-0.0`.
 */
export class Decimal {
  private constructor (readonly coef: bigint, readonly exp: number, readonly negativeZero = false) {}

  static fromInteger (n: number): Decimal {
    return new Decimal(BigInt(n), 0)
  }

  /** Like Ruby's `BigDecimal(float.to_s)`: the float's shortest decimal form. */
  static fromNumber (x: number): Decimal {
    if (Object.is(x, -0)) return new Decimal(BigInt(0), 0, true)
    if (Number.isInteger(x)) return Decimal.fromInteger(x)
    const [mantissa, exponent] = x.toExponential().split('e')
    const [int, frac = ''] = mantissa.split('.')
    return new Decimal(BigInt(int + frac), Number(exponent) - frac.length)
  }

  /** Parses `-12.34`-style decimal strings, the form Shopify/liquid accepts. */
  static parse (str: string): Decimal | undefined {
    const m = /^(-?\d+)\.(\d+)$/.exec(str.trim())
    if (!m) return undefined
    const coef = BigInt(m[1] + m[2])
    return new Decimal(coef, -m[2].length, coef === BigInt(0) && m[1].startsWith('-'))
  }

  add (other: Decimal): Decimal {
    const [a, b, exp] = align(this, other)
    return new Decimal(a + b, exp, this.negativeZero && other.negativeZero)
  }

  sub (other: Decimal): Decimal {
    const [a, b, exp] = align(this, other)
    return new Decimal(a - b, exp, this.negativeZero && other.isZero() && !other.negativeZero)
  }

  mul (other: Decimal): Decimal {
    const coef = this.coef * other.coef
    return new Decimal(coef, this.exp + other.exp, coef === BigInt(0) && this.isNegative() !== other.isNegative())
  }

  /** Floored modulo (result takes the divisor's sign), as Ruby's `%`. */
  mod (other: Decimal): Decimal {
    const [a, b, exp] = align(this, other)
    const r = ((a % b) + b) % b
    return new Decimal(r, exp, r === BigInt(0) && this.negativeZero)
  }

  /**
   * Quotient as the nearest double. Computes enough digits plus a sticky digit
   * so the final string-to-number conversion rounds correctly.
   */
  div (other: Decimal): number {
    if (other.coef === BigInt(0)) return this.toNumber() / other.toNumber()
    const negative = this.isNegative() !== other.isNegative()
    const num = abs(this.coef)
    const den = abs(other.coef)
    const shift = Math.max(0, 25 + digitCount(den) - digitCount(num))
    const scaled = num * pow10(shift)
    let quotient = scaled / den
    let exp = this.exp - other.exp - shift
    if (scaled % den !== BigInt(0)) {
      quotient = quotient * BigInt(10) + BigInt(1)
      exp -= 1
    }
    return Number(`${negative ? '-' : ''}${quotient}e${exp}`)
  }

  /** Rounds half away from zero (BigDecimal's default) to `digits` decimal places. */
  round (digits: number): Decimal {
    if (this.exp >= -digits) return this
    const divisor = pow10(-digits - this.exp)
    const magnitude = abs(this.coef)
    let q = magnitude / divisor
    if ((magnitude % divisor) * BigInt(2) >= divisor) q += BigInt(1)
    return new Decimal(this.coef < BigInt(0) ? -q : q, -digits)
  }

  floor (): number {
    return Number(this.toIntegerBigInt('floor'))
  }

  ceil (): number {
    return Number(this.toIntegerBigInt('ceil'))
  }

  abs (): Decimal {
    return new Decimal(abs(this.coef), this.exp)
  }

  compare (other: Decimal): number {
    const [a, b] = align(this, other)
    return a < b ? -1 : a > b ? 1 : 0
  }

  isZero () {
    return this.coef === BigInt(0)
  }

  isNegative () {
    return this.coef < BigInt(0) || this.negativeZero
  }

  /** Nearest double, as BigDecimal#to_f. */
  toNumber (): number {
    return this.negativeZero ? -0 : Number(`${this.coef}e${this.exp}`)
  }

  private toIntegerBigInt (mode: 'floor' | 'ceil'): bigint {
    if (this.exp >= 0) return this.coef * pow10(this.exp)
    const divisor = pow10(-this.exp)
    const q = this.coef / divisor // truncates toward zero
    if (this.coef % divisor === BigInt(0)) return q
    if (mode === 'floor') return this.coef < BigInt(0) ? q - BigInt(1) : q
    return this.coef > BigInt(0) ? q + BigInt(1) : q
  }
}

function align (a: Decimal, b: Decimal): [bigint, bigint, number] {
  const exp = Math.min(a.exp, b.exp)
  return [a.coef * pow10(a.exp - exp), b.coef * pow10(b.exp - exp), exp]
}

function abs (n: bigint) {
  return n < BigInt(0) ? -n : n
}

function pow10 (n: number) {
  return BigInt('1' + '0'.repeat(n))
}

function digitCount (n: bigint) {
  return n.toString().length
}
