import { isBlank, Arguments } from '../template'
import { Drop, Hash, ValueToken, Liquid, Tag, evalToken, evalTokenValue, Emitter, TagToken, TopLevelToken, Context, Template, ParseStream, FilteredValueToken } from '..'
import { assertEmpty, isNil, isString, isValueToken, toEnumerable, toInteger, toValue } from '../util'
import { LiquidRange } from '../util/liquid-range'
import { createScope } from '../context/scope'
import { ForloopDrop } from '../drop/forloop-drop'
import { Parser } from '../parser'

export default class extends Tag {
  get blank () { return isBlank(this.templates) && isBlank(this.elseTemplates) }
  variable: string
  collection: ValueToken | FilteredValueToken
  hash: Hash
  templates: Template[]
  elseTemplates: Template[]

  constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const variable = this.tokenizer.readIdentifier()
    const inStr = this.tokenizer.readIdentifier()
    const collection = this.tokenizer.readValue()
    if (!variable.size() || inStr.content !== 'in' || !collection) {
      throw new Error(`illegal tag: ${token.getText()}`)
    }

    this.variable = variable.content
    this.collection = collection
    this.hash = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
    this.templates = []
    this.elseTemplates = []

    let p
    const stream: ParseStream = parser.parseStream(remainTokens)
      .on('start', () => (p = this.templates))
      .on<TagToken>('tag:else', tag => { assertEmpty(tag.args); p = this.elseTemplates })
      .on<TagToken>('tag:endfor', tag => { assertEmpty(tag.args); stream.stop() })
      .on('template', (tpl: Template) => p.push(tpl))
      .on('end', () => { throw new Error(`tag ${token.getText()} not closed`) })

    stream.start()
  }
  * render (ctx: Context, emitter: Emitter): Generator<unknown, void | string, unknown> {
    const r = this.liquid.renderer
    const offsets = ctx.getRegister('for', {} as Record<string, number>)
    const offsetName = this.variable + '-' + this.collection.getText()

    const offsetToken = this.hash.hash.offset
    let from: number
    if (offsetToken === undefined) {
      from = 0
    } else if (offsetToken.getText() === 'continue') {
      from = offsets[offsetName] ?? 0
    } else {
      const v = yield evalTokenValue(offsetToken, ctx)
      from = isNil(v) ? 0 : toInteger(v)
    }

    const rawVal = yield evalToken(this.collection, ctx)
    const unwrapped = rawVal instanceof Drop ? rawVal : toValue(rawVal)

    const limitToken = this.hash.hash.limit
    let limitVal: number | undefined
    if (limitToken !== undefined) {
      const v = yield evalTokenValue(limitToken, ctx)
      limitVal = isNil(v) ? undefined : toInteger(v)
    }

    let collection: unknown[]
    if (isString(unwrapped)) {
      collection = unwrapped.length > 0 ? [unwrapped] : []
    } else {
      const resolved = rawVal instanceof Drop ? yield toValue(rawVal) : rawVal
      if (resolved instanceof LiquidRange) ctx.memoryLimit.use(resolved.length)
      collection = toEnumerable(resolved)
      if (this.liquid.options.orderedFilterParameters) {
        for (const key of Object.keys(this.hash.hash)) {
          if (key === 'offset') {
            if (offsetToken !== undefined) collection = sliceCollection(collection, from)
          } else if (key === 'limit') {
            if (limitVal !== undefined) collection = sliceCollection(collection, 0, limitVal)
          } else if (key === 'reversed') {
            collection = [...collection].reverse()
          }
        }
      } else {
        const to = limitVal === undefined ? undefined : from + limitVal
        collection = sliceCollection(collection, from, to)
        if ('reversed' in this.hash.hash) collection.reverse()
      }
    }

    offsets[offsetName] = from + collection.length
    if (!collection.length) {
      yield r.renderTemplates(this.elseTemplates, ctx, emitter)
      return
    }

    const forStack: ForloopDrop[] = ctx.getRegister('forStack', [])
    const forloop = new ForloopDrop(collection.length, this.collection.getText(), this.variable, forStack[forStack.length - 1])
    const scope = createScope({ forloop })
    forStack.push(forloop)
    ctx.push(scope)
    try {
      for (const item of collection) {
        scope[this.variable] = item
        ctx.continueCalled = ctx.breakCalled = false
        yield r.renderTemplates(this.templates, ctx, emitter)
        if (ctx.breakCalled) break
        forloop.next()
      }
    } finally {
      forStack.pop()
      ctx.continueCalled = ctx.breakCalled = false
      ctx.pop()
    }
  }

  public * children (): Generator<unknown, Template[]> {
    const templates = this.templates.slice()
    if (this.elseTemplates) {
      templates.push(...this.elseTemplates)
    }
    return templates
  }

  public * arguments (): Arguments {
    yield this.collection

    for (const [k, v] of Object.entries(this.hash.hash)) {
      if (k === 'offset' && v?.getText() === 'continue') continue
      if (isValueToken(v)) {
        yield v
      }
    }
  }

  public blockScope (): Iterable<string> {
    return [this.variable, 'forloop']
  }
}

function sliceCollection<T> (arr: T[], from: number, to?: number): T[] {
  const start = Math.max(from, 0)
  const finish = to === undefined ? arr.length : Math.min(to, arr.length)
  return start < finish ? arr.slice(start, finish) : []
}
