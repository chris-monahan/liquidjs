import { Token } from './token'
import { TokenKind } from '../parser'
import { LiquidFloat } from '../util/liquid-float'

export class NumberToken extends Token {
  public content: number
  constructor (
    public input: string,
    public begin: number,
    public end: number,
    public file?: string
  ) {
    super(TokenKind.Number, input, begin, end, file)
    this.content = Number(this.getText())
  }

  private float?: LiquidFloat

  /** The value under the `rubyNumbers` option: literals with a decimal point are floats. */
  get rubyValue (): number | LiquidFloat {
    if (!this.getText().includes('.')) return this.content
    return (this.float ??= new LiquidFloat(this.content))
  }
}
