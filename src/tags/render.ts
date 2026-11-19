import { __assign } from 'tslib'
import { Drop, ForloopDrop, NullDrop } from '../drop'
import { isArray, isIterable, isNil, isObject, isString, isValueToken, toValue } from '../util'
import { TopLevelToken, assert, Liquid, Token, ValueToken, Template, evalQuotedToken, TypeGuards, Tokenizer, evalToken, evalTokenValue, Hash, Emitter, TagToken, Context, Tag } from '..'
import { Parser } from '../parser'
import { Argument, Arguments, PartialScope } from '../template'

export type ParsedFileName = Template[] | Token | string | undefined

export type PartialBinding = { keyword: 'with' | 'for'; value: ValueToken; alias?: string }

export default class extends Tag {
  private file: ParsedFileName
  private currentFile?: string
  private hash: Hash
  private with?: PartialBinding
  private forBinding?: PartialBinding
  constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const tokenizer = this.tokenizer
    this.file = parseFilePath(tokenizer, this.liquid, parser)
    this.currentFile = token.file
    while (!tokenizer.end()) {
      const binding = parsePartialBinding(tokenizer)
      if (!binding) break
      if (binding.keyword === 'with') this.with = binding
      else this.forBinding = binding
    }
    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator)
  }
  * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const { liquid, hash, forBinding } = this
    const withBinding = this.with
    const filepath = (yield renderFilePath(this.file, ctx, liquid)) as string
    assert(isString(filepath), () => `illegal file path "${filepath}"`)
    const templates = (yield liquid._parsePartialFile(filepath, ctx.sync, this.currentFile)) as Template[]
    const defaultAlias = partialBasename(filepath)

    function * renderOne (hasFor: boolean, forItem: unknown, forloop?: ForloopDrop): Generator<unknown, void, unknown> {
      const childCtx = ctx.spawn()
      childCtx.setRegister('disallowInclude', true)
      const scope = childCtx.bottom()
      if (forloop) scope['forloop'] = forloop
      __assign(scope, yield hash.render(ctx))
      if (withBinding) {
        const val = yield evalToken(withBinding.value, ctx)
        if (!isLiquidNil(val)) scope[withBinding.alias || defaultAlias] = val
      }
      if (hasFor && !isLiquidNil(forItem)) {
        scope[forBinding!.alias || defaultAlias] = forItem
      }
      yield liquid.renderer.renderTemplates(templates, childCtx, emitter)
    }

    if (forBinding) {
      const raw = yield evalToken(forBinding.value, ctx)
      const unwrapped = raw instanceof Drop ? yield toValue(raw) : toValue(raw)
      const list = toRenderForList(unwrapped)
      if (list !== undefined) {
        const forloop = new ForloopDrop(list.length, forBinding.value.getText(), forBinding.alias || defaultAlias)
        forloop.name = filepath
        for (const item of list) {
          yield * renderOne(true, item, forloop)
          forloop.next()
        }
      } else {
        yield * renderOne(true, raw)
      }
    } else {
      yield * renderOne(false, undefined)
    }
  }

  public * children (partials: boolean, sync: boolean): Generator<unknown, Template[]> {
    if (partials && isString(this.file)) {
      return (yield this.liquid._parsePartialFile(this.file, sync, this.currentFile)) as Template[]
    }
    return []
  }

  public partialScope (): PartialScope | undefined {
    if (isString(this.file)) {
      const names: Array<string | [string, Argument]> = Object.keys(this.hash.hash)

      if (this.with) {
        const { value, alias } = this.with
        names.push([alias || partialBasename(this.file), value])
      }

      if (this.forBinding) {
        const { value, alias } = this.forBinding
        names.push([alias || partialBasename(this.file), value])
      }

      return { name: this.file, isolated: true, scope: names }
    }
  }

  public * arguments (): Arguments {
    for (const v of Object.values(this.hash.hash)) {
      if (isValueToken(v)) {
        yield v
      }
    }

    if (this.with) {
      const { value } = this.with
      if (isValueToken(value)) {
        yield value
      }
    }

    if (this.forBinding) {
      const { value } = this.forBinding
      if (isValueToken(value)) {
        yield value
      }
    }
  }
}

export function partialBasename (filepath: string): string {
  return filepath.split('/').filter(Boolean).pop() || filepath
}

export function parsePartialBinding (tokenizer: Tokenizer): PartialBinding | undefined {
  tokenizer.skipBlank()
  const begin = tokenizer.p
  const keyword = tokenizer.readIdentifier()
  if (keyword.content === 'with' || keyword.content === 'for') {
    tokenizer.skipBlank()
    if (tokenizer.peek() !== ':') {
      const value = tokenizer.readValue()
      if (value) {
        const beforeAs = tokenizer.p
        const asStr = tokenizer.readIdentifier()
        let alias: string | undefined
        if (asStr.content === 'as') {
          tokenizer.skipBlank()
          if (tokenizer.peek() !== ':') {
            alias = tokenizer.readIdentifier().content || undefined
          } else {
            tokenizer.p = beforeAs
          }
        } else {
          tokenizer.p = beforeAs
        }
        tokenizer.skipBlank()
        if (tokenizer.peek() === ',') tokenizer.advance()
        return { keyword: keyword.content, value, alias }
      }
    }
  }
  tokenizer.p = begin
}

function isLiquidNil (val: unknown): boolean {
  return isNil(val) || val instanceof NullDrop
}

function toRenderForList (val: unknown): unknown[] | undefined {
  const v = val instanceof Drop ? val.valueOf() : toValue(val)
  if (isArray(v)) return v
  if (isString(v) && v.length > 0) return [v]
  if (isIterable(v)) return Array.from(v)
  if (isObject(v)) {
    const proto = Object.getPrototypeOf(v)
    if (proto === null || proto === Object.prototype) {
      return Object.keys(v).map(k => [k, (v as Record<string, unknown>)[k]])
    }
  }
}

/**
 * @return undefined for "none" when allowNone is true
 * @return Template[] for quoted with tags and/or filters
 * @return Token for expression (not quoted)
 * @throws TypeError if cannot read next token
 */
export function parseFilePath (tokenizer: Tokenizer, liquid: Liquid, parser: Parser, allowNone = false): ParsedFileName {
  if (liquid.options.dynamicPartials) {
    const file = tokenizer.readValue()
    tokenizer.assert(file, 'illegal file path')
    if (allowNone && file!.getText() === 'none') return
    if (TypeGuards.isQuotedToken(file)) {
      // for filenames like "files/{{file}}", eval as liquid template
      const templates = parser.parse(evalQuotedToken(file))
      return optimize(templates)
    }
    return file
  }
  const tokens = [...tokenizer.readFileNameTemplate(liquid.options)]
  const templates = optimize(parser.parseTokens(tokens))
  return allowNone && templates === 'none' ? undefined : templates
}

function optimize (templates: Template[]): string | Template[] {
  // for filenames like "files/file.liquid", extract the string directly
  if (templates.length === 1 && TypeGuards.isHTMLToken(templates[0].token)) return templates[0].token.getContent()
  return templates
}

export function * renderFilePath (file: ParsedFileName, ctx: Context, liquid: Liquid): IterableIterator<unknown> {
  if (typeof file === 'string') return file
  if (Array.isArray(file)) return liquid.renderer.renderTemplates(file, ctx)
  return yield evalTokenValue(file, ctx)
}
