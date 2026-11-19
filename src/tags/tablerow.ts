import { isBlank, Arguments } from '../template'
import { isIterable, isString, isValueToken, LiquidRuntimeError, toEnumerable, toValue } from '../util'
import { Drop } from '../drop'
import { createScope } from '../context/scope'
import { ValueToken, Liquid, Tag, evalToken, Emitter, Hash, TagToken, TopLevelToken, Context, Template, ParseStream, FilteredValueToken } from '..'
import { TablerowloopDrop } from '../drop/tablerowloop-drop'
import { Parser } from '../parser'

const rLeadingDecimalInt = /^[ \t\n\r\f\v]*([+-]?\d+(?:_\d+)*)/

function toTablerowInt (val: unknown): number {
  val = toValue(val)
  if (val == null) return 0
  if (val && typeof val === 'object' && !(val instanceof Drop) && typeof (val as { valueOf?: unknown }).valueOf === 'function') {
    const prim = (val as { valueOf(): unknown }).valueOf()
    if (typeof prim === 'number' || typeof prim === 'string' || typeof prim === 'boolean') val = prim
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) throw new LiquidRuntimeError('invalid integer')
    return Math.trunc(val) || 0
  }
  if (typeof val === 'string') {
    const m = rLeadingDecimalInt.exec(val)
    return m ? (parseInt(m[1].replace(/_/g, ''), 10) || 0) : 0
  }
  throw new LiquidRuntimeError('invalid integer')
}

function sliceForTablerow (val: unknown, from: number, to: number | undefined, memoryLimit: { use(n: number): void }): unknown[] {
  if (isString(val)) {
    return val.length > 0 ? [val] : []
  }
  if (Array.isArray(val)) {
    if (to !== undefined && to <= from) return []
    const start = Math.max(from, 0)
    const end = to === undefined ? val.length : Math.max(to, start)
    return val.slice(start, end)
  }
  if (
    val &&
    typeof val === 'object' &&
    typeof (val as { start?: unknown }).start === 'number' &&
    typeof (val as { end?: unknown }).end === 'number' &&
    isIterable(val)
  ) {
    const rangeVal = val as unknown as { start: number, end: number }
    const rStart = rangeVal.start
    const rEnd = rangeVal.end
    const total = rEnd >= rStart ? rEnd - rStart + 1 : 0
    if (total === 0 || (to !== undefined && to <= from)) return []
    const startIdx = Math.max(from, 0)
    const endIdx = to === undefined ? total : Math.min(total, Math.max(to, startIdx))
    const count = Math.max(0, endIdx - startIdx)
    memoryLimit.use(count)
    const out = new Array(count)
    for (let i = 0; i < count; i++) out[i] = rStart + startIdx + i
    return out
  }
  if (isIterable(val)) {
    if (to !== undefined && to <= from) return []
    const out: unknown[] = []
    let index = 0
    for (const item of val) {
      if (to !== undefined && to <= index) break
      memoryLimit.use(1)
      if (from <= index) out.push(item)
      index++
    }
    return out
  }
  const enumArr = toEnumerable(val)
  if (to !== undefined && to <= from) return []
  const start = Math.max(from, 0)
  const end = to === undefined ? enumArr.length : Math.max(to, start)
  return enumArr.slice(start, end)
}

export default class extends Tag {
  get blank () { return isBlank(this.templates) }
  variable: string
  args: Hash
  templates: Template[]
  collection: ValueToken | FilteredValueToken
  constructor (tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    const variable = this.tokenizer.readIdentifier()
    this.tokenizer.skipBlank()

    const predicate = this.tokenizer.readIdentifier()
    const collectionToken = this.tokenizer.readValue()
    if (predicate.content !== 'in' || !collectionToken) {
      throw new Error(`illegal tag: ${tagToken.getText()}`)
    }

    this.variable = variable.content
    this.collection = collectionToken
    this.args = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
    this.templates = []

    let p
    const stream: ParseStream = parser.parseStream(remainTokens)
      .on('start', () => (p = this.templates))
      .on('tag:endtablerow', () => stream.stop())
      .on('template', (tpl: Template) => p.push(tpl))
      .on('end', () => {
        throw new Error(`tag ${tagToken.getText()} not closed`)
      })

    stream.start()
  }

  * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const resolvedCollection = yield toValue(yield evalToken(this.collection, ctx))
    if (resolvedCollection == null || resolvedCollection === false) return

    const args = (yield this.args.render(ctx)) as Record<string, any>
    const from = 'offset' in this.args.hash ? toTablerowInt(args.offset) : 0
    const to = 'limit' in this.args.hash ? from + toTablerowInt(args.limit) : undefined

    const collection = sliceForTablerow(resolvedCollection, from, to, ctx.memoryLimit)
    const cols = 'cols' in this.args.hash ? toTablerowInt(args.cols) : collection.length

    emitter.write('<tr class="row1">\n')
    const r = this.liquid.renderer
    const tablerowloop = new TablerowloopDrop(collection.length, cols, this.collection.getText(), this.variable)
    const scope = createScope({ tablerowloop })
    ctx.push(scope)
    try {
      for (let idx = 0; idx < collection.length; idx++, tablerowloop.next()) {
        scope[this.variable] = collection[idx]
        emitter.write(`<td class="col${tablerowloop.col()}">`)
        ctx.continueCalled = ctx.breakCalled = false
        yield r.renderTemplates(this.templates, ctx, emitter)
        emitter.write('</td>')
        if (ctx.breakCalled) {
          ctx.breakCalled = false
          break
        }
        ctx.continueCalled = false
        if (tablerowloop.col_last() && !tablerowloop.last()) {
          emitter.write(`</tr>\n<tr class="row${tablerowloop.row() + 1}">`)
        }
      }
    } finally {
      ctx.continueCalled = ctx.breakCalled = false
      ctx.pop()
    }
    emitter.write('</tr>\n')
  }

  public * children (): Generator<unknown, Template[]> {
    return this.templates
  }

  public * arguments (): Arguments {
    yield this.collection

    for (const v of Object.values(this.args.hash)) {
      if (isValueToken(v)) {
        yield v
      }
    }
  }

  public blockScope (): string[] {
    return [this.variable, 'tablerowloop']
  }
}
