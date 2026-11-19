import { Comparable } from '../drop/comparable'

export class LiquidRange implements Comparable {
  public readonly start: number
  public readonly stop: number

  public constructor (start: number, stop: number) {
    this.start = start === 0 ? 0 : start
    this.stop = stop === 0 ? 0 : stop
  }

  public get length (): number {
    return Math.max(0, this.stop - this.start + 1)
  }

  public toString (): string {
    return `${this.start}..${this.stop}`
  }

  public * [Symbol.iterator] (): IterableIterator<number> {
    for (let i = this.start; i <= this.stop; i++) yield i
  }

  public toArray (): number[] {
    const arr: number[] = []
    for (let i = this.start; i <= this.stop; i++) arr.push(i)
    return arr
  }

  public includes (val: unknown): boolean {
    const v = (val && typeof (val as any).valueOf === 'function') ? (val as any).valueOf() : val
    if (typeof v !== 'number' || Number.isNaN(v)) return false
    return this.start <= this.stop && v >= this.start && v <= this.stop
  }

  public equals (rhs: any): boolean {
    return rhs instanceof LiquidRange && rhs.start === this.start && rhs.stop === this.stop
  }

  public gt () {
    return false
  }

  public geq () {
    return false
  }

  public lt () {
    return false
  }

  public leq () {
    return false
  }
}
