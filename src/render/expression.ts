import { QuotedToken, RangeToken, OperatorToken, Token, PropertyAccessToken, OperatorType, operatorTypes, FilteredValueToken } from '../tokens'
import { isRangeToken, isPropertyAccessToken, isFilteredValueToken, isNumberToken, UndefinedVariableError, range, isOperatorToken, assert, LiquidRuntimeError, toValue } from '../util'
import type { Context } from '../context'
import type { UnaryOperatorHandler } from '../render'
import { isTruthy } from './boolean'
import { Drop } from '../drop'
import { Filter } from '../template/filter'

interface Clause {
  postfix: Token[];
  unknownOperator?: string;
  nextOp?: 'and' | 'or';
}

function detectUnknownOperator (tokens: Token[]): string | undefined {
  let prevOperand = false
  for (const token of tokens) {
    if (isOperatorToken(token) && operatorTypes[token.operator] !== OperatorType.Unary) {
      prevOperand = false
    } else if (isOperatorToken(token)) {
      if (prevOperand) return token.getText()
      prevOperand = false
    } else {
      if (prevOperand) return token.getText()
      prevOperand = true
    }
  }
  return undefined
}

function buildClauses (tokens: Token[]): Clause[] {
  const clauses: Clause[] = []
  let current: Token[] = []
  for (const token of tokens) {
    if (isOperatorToken(token) && (token.operator === 'and' || token.operator === 'or')) {
      clauses.push({
        postfix: [...toPostfix(current)],
        unknownOperator: detectUnknownOperator(current),
        nextOp: token.operator
      })
      current = []
    } else {
      current.push(token)
    }
  }
  clauses.push({
    postfix: [...toPostfix(current)],
    unknownOperator: detectUnknownOperator(current)
  })
  return clauses
}

function * evalPostfix (postfix: Token[], ctx: Context, lenient?: boolean): Generator<unknown, unknown, unknown> {
  const operands: any[] = []
  for (const token of postfix) {
    if (isOperatorToken(token)) {
      const r = operands.pop()
      let result
      if (operatorTypes[token.operator] === OperatorType.Unary) {
        result = yield (ctx.opts.operators[token.operator] as UnaryOperatorHandler)(r, ctx)
      } else {
        const l = operands.pop()
        result = yield ctx.opts.operators[token.operator](l, r, ctx)
      }
      operands.push(result)
    } else {
      operands.push(yield evalToken(token, ctx, lenient))
    }
  }
  return operands[0]
}

export class Expression {
  readonly postfix: Token[]
  private readonly clauses: Clause[]

  public constructor (tokens: Iterable<Token>) {
    const raw = [...tokens]
    this.postfix = [...toPostfix(raw)]
    this.clauses = buildClauses(raw)
  }
  public * evaluate (ctx: Context, lenient?: boolean, checkUnknownOperator = false): Generator<unknown, unknown, unknown> {
    assert(ctx, 'unable to evaluate: context not defined')
    for (const clause of this.clauses) {
      if (checkUnknownOperator && clause.unknownOperator !== undefined) {
        throw new LiquidRuntimeError(`Unknown operator ${clause.unknownOperator}`)
      }
      const val = yield * evalPostfix(clause.postfix, ctx, lenient)
      if (!clause.nextOp) {
        return this.clauses.length === 1 ? val : isTruthy(yield toValue(val), ctx)
      }
      const truthy = isTruthy(yield toValue(val), ctx)
      if (clause.nextOp === 'or' && truthy) return true
      if (clause.nextOp === 'and' && !truthy) return false
    }
    return false
  }
  public valid () {
    return !!this.postfix.length
  }
}

/**
 * Evaluate `token`, preserving Drops.
 * Operators use this so `Comparable` drops (`empty`, `nil`, `blank`) and custom drops
 * are compared as drops rather than as their `valueOf()` result.
 */
export function * evalToken (token: Token | undefined, ctx: Context, lenient = false): IterableIterator<unknown> {
  if (!token) return
  if (ctx.opts.rubyNumbers && isNumberToken(token)) return token.rubyValue
  if ('content' in token) return token.content
  if (isPropertyAccessToken(token)) return yield evalPropertyAccessToken(token, ctx, lenient)
  if (isRangeToken(token)) return yield evalRangeToken(token, ctx)
  if (isFilteredValueToken(token)) return yield evalFilteredValueToken(token, ctx, lenient)
}

function * evalFilteredValueToken (token: FilteredValueToken, ctx: Context, lenient: boolean): IterableIterator<unknown> {
  assert(ctx.liquid, 'FilteredValueToken evaluation requires liquid instance in context')
  lenient = lenient || (ctx.opts.lenientIf && token.filters.length > 0 && token.filters[0].name === 'default')
  let val = yield token.initial.evaluate(ctx, lenient)

  for (const filterToken of token.filters) {
    const filterImpl = ctx.liquid.filters[filterToken.name]
    assert(filterImpl || !ctx.liquid.options.strictFilters, () => `undefined filter: ${filterToken.name}`)
    const filter = new Filter(filterToken, filterImpl, ctx.liquid)
    val = yield filter.render(val, ctx)
  }

  return val
}

/**
 * Evaluate `token` to the value filters and tags consume.
 * Awaits a promise returned by `Drop.valueOf()`.
 */
export function * evalTokenValue (token: Token | undefined, ctx: Context, lenient = false): IterableIterator<unknown> {
  return yield toValue(yield evalToken(token, ctx, lenient))
}

function * evalPropertyAccessToken (token: PropertyAccessToken, ctx: Context, lenient: boolean): IterableIterator<unknown> {
  const props: (string | number | Drop)[] = []
  for (const prop of token.props) {
    props.push((yield evalTokenValue(prop, ctx, false)) as unknown as string | number | Drop)
  }
  try {
    if (token.variable) {
      const variable = yield evalToken(token.variable, ctx, lenient)
      return yield ctx._getFromScope(variable, props)
    } else {
      return yield ctx._get(props)
    }
  } catch (e) {
    if (lenient && (e as Error).name === 'InternalUndefinedVariableError') return null
    throw (new UndefinedVariableError(e as Error, token))
  }
}

export function evalQuotedToken (token: QuotedToken) {
  return token.content
}

function * evalRangeToken (token: RangeToken, ctx: Context): IterableIterator<unknown> {
  const low = (yield evalTokenValue(token.lhs, ctx)) as unknown as number
  const high = (yield evalTokenValue(token.rhs, ctx)) as unknown as number
  ctx.memoryLimit.use(high - low + 1)
  return range(+low, +high + 1)
}

function * toPostfix (tokens: Iterable<Token>): IterableIterator<Token> {
  const ops: OperatorToken[] = []
  for (const token of tokens) {
    if (isOperatorToken(token)) {
      while (ops.length && ops[ops.length - 1].getPrecedence() > token.getPrecedence()) {
        yield ops.pop()!
      }
      ops.push(token)
    } else yield token
  }
  while (ops.length) {
    yield ops.pop()!
  }
}
