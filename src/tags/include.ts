import { Template, TopLevelToken, Liquid, Tag, assert, evalToken, Hash, Emitter, TagToken, Context } from '..'
import { BlockMode, createScope, Scope } from '../context'
import { Drop } from '../drop'
import { Parser } from '../parser'
import { Argument, Arguments, PartialScope } from '../template'
import { isArray, isRangeToken, isString, isValueToken, toValue } from '../util'
import { parseFilePath, renderFilePath, ParsedFileName, parsePartialBinding, partialBasename, PartialBinding } from './render'

export default class extends Tag {
  private file: ParsedFileName
  private currentFile?: string
  private binding?: PartialBinding
  private hash: Hash
  constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const { tokenizer } = token
    this.file = parseFilePath(tokenizer, this.liquid, parser)
    this.currentFile = token.file
    this.binding = parsePartialBinding(tokenizer)
    this.hash = new Hash(tokenizer, liquid.options.jekyllInclude || liquid.options.keyValueSeparator)
  }
  * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const { liquid, hash, binding } = this
    const { renderer } = liquid
    assert(!ctx.getRegister('disallowInclude'), 'include usage is not allowed in this context')

    const filepath = (yield renderFilePath(this.file, ctx, liquid)) as string
    assert(isString(filepath), "Argument error in tag 'include' - Illegal template name")

    if (ctx.opts.jekyllInclude) {
      const saved = ctx.saveRegister('blocks', 'blockMode')
      ctx.setRegister('blocks', {})
      ctx.setRegister('blockMode', BlockMode.OUTPUT)
      const scope = createScope((yield hash.render(ctx)) as Scope)
      if (binding) scope[binding.alias || filepath] = yield evalToken(binding.value, ctx)
      const templates = (yield liquid._parsePartialFile(filepath, ctx.sync, this.currentFile)) as Template[]
      ctx.push(createScope({ include: scope }))
      try {
        yield renderer.renderTemplates(templates, ctx, emitter)
      } finally {
        ctx.pop()
        ctx.restoreRegister(saved)
      }
      return
    }

    let variable: unknown
    if (binding) {
      variable = yield evalToken(binding.value, ctx)
    } else {
      try {
        variable = yield ctx._get([filepath])
      } catch (e) {
        if ((e as Error).name !== 'InternalUndefinedVariableError') throw e
      }
    }
    const unwrapped = variable instanceof Drop ? yield toValue(variable) : toValue(variable)
    const templates = (yield liquid._parsePartialFile(filepath, ctx.sync, this.currentFile)) as Template[]
    const alias = binding?.alias || partialBasename(filepath)

    const saved = ctx.saveRegister('blocks', 'blockMode')
    ctx.setRegister('blocks', {})
    ctx.setRegister('blockMode', BlockMode.OUTPUT)
    const scope = createScope()
    ctx.push(scope)
    try {
      yield hash.render(ctx, scope)
      if (isArray(unwrapped) && !isRangeToken(binding?.value)) {
        for (const item of unwrapped) {
          scope[alias] = item
          yield renderer.renderTemplates(templates, ctx, emitter)
          if (ctx.breakCalled || ctx.continueCalled) break
        }
      } else {
        scope[alias] = variable
        yield renderer.renderTemplates(templates, ctx, emitter)
      }
    } finally {
      ctx.pop()
      ctx.restoreRegister(saved)
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
      let names: Array<string | [string, Argument]>

      if (this.liquid.options.jekyllInclude) {
        names = ['include']
      } else {
        names = Object.keys(this.hash.hash)
        if (this.binding) {
          names.push([this.binding.alias || partialBasename(this.file), this.binding.value])
        }
      }

      return { name: this.file, isolated: false, scope: names }
    }
  }

  public * arguments (): Arguments {
    yield * Object.values(this.hash.hash).filter(isValueToken)

    if (isValueToken(this.file)) {
      yield this.file
    }

    if (this.binding && isValueToken(this.binding.value)) {
      yield this.binding.value
    }
  }
}
