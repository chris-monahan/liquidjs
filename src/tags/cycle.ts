import { Token, TopLevelToken, Liquid, ValueToken, FilteredValueToken, evalToken, evalQuotedToken, Emitter, TagToken, Context, Tag, Value } from '..'
import { Arguments } from '../template'
import { toValue, isQuotedToken, isNumberToken, isLiteralToken, isRangeToken } from '../util'

export default class extends Tag {
  private candidates: FilteredValueToken[] = []
  private group?: ValueToken
  private unnamedKey?: string | symbol
  constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    const begin = this.tokenizer.p
    const group = this.tokenizer.readValue()
    this.tokenizer.skipBlank()

    if (group) {
      if (this.tokenizer.peek() === ':') {
        this.group = group
        this.tokenizer.advance()
      } else this.tokenizer.p = begin
    }

    while (!this.tokenizer.end()) {
      const value = this.tokenizer.readFilteredValue()
      this.candidates.push(value)
      this.tokenizer.readTo(',')
    }
    this.tokenizer.assert(this.candidates.length, () => `empty candidates: "${token.getText()}"`)
    if (!this.group) {
      this.unnamedKey = buildUnnamedKey(this.candidates)
    }
  }

  * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    let key: unknown
    if (this.group) {
      const group = yield toValue(yield evalToken(this.group, ctx))
      key = group === undefined ? null : group
    } else {
      key = this.unnamedKey
    }

    const groups = ctx.getRegister('cycle', new Map<unknown, number>())
    let idx = groups.get(key) ?? 0
    const token = this.candidates[idx]
    idx += 1
    if (idx >= this.candidates.length) idx = 0
    groups.set(key, idx)

    if (token !== undefined) {
      const candidate = new Value(token, this.liquid)
      let val = yield toValue(yield candidate.value(ctx, false))
      const outputEscape = this.liquid.options.outputEscape
      if (outputEscape && !candidate.filters[candidate.filters.length - 1]?.raw) {
        val = yield outputEscape.call({ context: ctx, token: this.token, liquid: this.liquid }, val)
      }
      emitter.write(val)
    }
  }

  public * arguments (): Arguments {
    yield * this.candidates

    if (this.group) {
      yield this.group
    }
  }
}

function atomicLiteralKey (token: Token): string | undefined {
  if (isQuotedToken(token)) return `s:${JSON.stringify(evalQuotedToken(token))}`
  if (isNumberToken(token)) return `n:${Number(token.content)}`
  if (isLiteralToken(token)) return `l:${token.literal === 'null' ? 'nil' : token.literal}`
}

function candidateLiteralKey (candidate: FilteredValueToken): string | undefined {
  if (candidate.filters.length > 0 || candidate.initial.postfix.length !== 1) return
  const token = candidate.initial.postfix[0]
  const atomic = atomicLiteralKey(token)
  if (atomic !== undefined) return atomic
  if (isRangeToken(token)) {
    const lhs = atomicLiteralKey(token.lhs)
    const rhs = atomicLiteralKey(token.rhs)
    if (lhs !== undefined && rhs !== undefined) return `r:${lhs}..${rhs}`
  }
}

function buildUnnamedKey (candidates: FilteredValueToken[]): string | symbol {
  const parts: string[] = []
  for (const candidate of candidates) {
    const key = candidateLiteralKey(candidate)
    if (key === undefined) return Symbol('cycle')
    parts.push(key)
  }
  return `\0${parts.join(',')}`
}
