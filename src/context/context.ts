import { codePointLength, readFirst, readLast, readSize } from '../util/underscore'
import { LiquidRange } from '../util/liquid-range'
import { getPerformance } from '../util/performance'
import { Drop } from '../drop/drop'
import { __assign } from 'tslib'
import { NormalizedFullOptions, defaultOptions, RenderOptions } from '../liquid-options'
import { createScope, Scope } from './scope'
import { hasOwnProperty, isArray, isNil, isUndefined, isString, isFunction, isNumber, toLiquid, InternalUndefinedVariableError, toValueSync, isObject, Limiter, toValue, readArrayElement } from '../util'
import type { LiquidError } from '../util/error'
import { LiquidFloat } from '../util/liquid-float'

type PropertyKey = string | number;

export class Context {
  /**
   * insert a Context-level empty scope,
   * for tags like `{% capture %}` `{% assign %}` to operate
   */
  private scopes: Scope[] = [createScope()]
  private registers: Record<string, any> = {}
  /**
   * user passed in scope
   * `{% increment %}`, `{% decrement %}` changes this scope,
   * whereas `{% capture %}`, `{% assign %}` only hide this scope
   */
  public environments: Scope
  /**
   * global scope used as fallback for missing variables
   */
  public globals: Scope
  public sync: boolean
  public breakCalled = false
  public continueCalled = false
  /**
   * The normalized liquid options object
   */
  public opts: NormalizedFullOptions
  /**
   * Reference to the Liquid instance for filter resolution
   */
  public liquid?: any
  /**
   * Throw when accessing undefined variable?
   */
  public strictVariables: boolean;
  public ownPropertyOnly: boolean;
  public memoryLimit: Limiter;
  public renderLimit: Limiter;
  /** Errors caught by `inlineErrors`, including those from partials */
  public errors: LiquidError[];
  public constructor (env: object = {}, opts: NormalizedFullOptions = defaultOptions, renderOptions: RenderOptions = {}, { memoryLimit, renderLimit, liquid }: { memoryLimit?: Limiter, renderLimit?: Limiter, liquid?: any } = {}) {
    this.sync = !!renderOptions.sync
    this.opts = opts
    this.globals = renderOptions.globals ?? opts.globals
    this.environments = isObject(env) ? env : Object(env)
    this.strictVariables = renderOptions.strictVariables ?? this.opts.strictVariables
    this.ownPropertyOnly = renderOptions.ownPropertyOnly ?? opts.ownPropertyOnly
    this.memoryLimit = memoryLimit ?? new Limiter('memory alloc', renderOptions.memoryLimit ?? opts.memoryLimit)
    this.renderLimit = renderLimit ?? new Limiter('template render', getPerformance().now() + (renderOptions.renderLimit ?? opts.renderLimit))
    this.liquid = liquid
    this.errors = renderOptions.errors ?? []
  }
  public getRegister<T> (key: string, defaultValue: T = undefined as T): T {
    return (this.registers[key] = this.registers[key] || defaultValue)
  }
  public setRegister (key: string, value: any) {
    return (this.registers[key] = value)
  }
  public saveRegister (...keys: string[]): [string, any][] {
    return keys.map(key => [key, this.getRegister(key)])
  }
  public restoreRegister (keyValues: [string, any][]) {
    return keyValues.forEach(([key, value]) => this.setRegister(key, value))
  }
  public getAll () {
    return [this.globals, this.environments, ...this.scopes]
      .reduce((ctx, val) => __assign(ctx, val), {})
  }
  /**
   * @deprecated use `_get()` or `getSync()` instead
   */
  public get (paths: PropertyKey[]): unknown {
    return this.getSync(paths)
  }
  public getSync (paths: PropertyKey[]): unknown {
    return toValueSync(this._get(paths))
  }
  public * _get (paths: (PropertyKey | Drop)[] | string, commands?: boolean[]): IterableIterator<unknown> {
    if (isString(paths)) paths = paths.split('.')
    const scope = this.findScope(paths[0] as string) // first prop should always be a string
    return yield this._getFromScope(scope, paths, this.strictVariables, commands ?? paths.map((_, i) => i > 0))
  }
  /**
   * @deprecated use `_get()` instead
   */
  public getFromScope (scope: unknown, paths: PropertyKey[] | string): IterableIterator<unknown> {
    return toValueSync(this._getFromScope(scope, paths))
  }
  public * _getFromScope (scope: unknown, paths: (PropertyKey | Drop)[] | string, strictVariables = this.strictVariables, commands?: boolean[]): IterableIterator<unknown> {
    if (isString(paths)) paths = paths.split('.')
    for (let i = 0; i < paths.length; i++) {
      scope = yield this.readProperty(scope as object, paths[i], commands ? commands[i] : true)
      if (strictVariables && isUndefined(scope)) {
        throw new InternalUndefinedVariableError((paths as string[]).slice(0, i + 1).join!('.'))
      }
    }
    return scope
  }
  public push (ctx: object) {
    return this.scopes.push(ctx)
  }
  public pop () {
    return this.scopes.pop()
  }
  public bottom () {
    return this.scopes[0]
  }
  public spawn (scope = {}) {
    return new Context(scope, this.opts, {
      sync: this.sync,
      globals: this.globals,
      strictVariables: this.strictVariables,
      ownPropertyOnly: this.ownPropertyOnly,
      errors: this.errors
    }, {
      renderLimit: this.renderLimit,
      memoryLimit: this.memoryLimit,
      liquid: this.liquid
    })
  }
  private findScope (key: string | number) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const candidate = this.scopes[i]
      if (key in candidate) return candidate
    }
    if (key in this.environments) return this.environments
    return this.globals
  }
  readProperty (obj: Scope, key: (PropertyKey | Drop), allowCommand = true) {
    obj = toLiquid(obj)
    const rawKey = toValue(key)
    if (isNil(obj)) return obj
    if (obj instanceof LiquidFloat) return undefined
    if (rawKey instanceof LiquidRange && !(obj instanceof Drop)) return undefined
    key = rawKey as PropertyKey
    if (isArray(obj) && isNumber(key)) return readArrayElement(obj, key, this.ownPropertyOnly)
    if (isString(obj)) {
      if (!allowCommand) return undefined
      if (key === 'first') return readFirst(obj, this.ownPropertyOnly)
      if (key === 'last') return readLast(obj, this.ownPropertyOnly)
      if (key === 'size' || key === 'length') return codePointLength(obj)
      return undefined
    }
    if (obj instanceof LiquidRange) {
      if (!allowCommand) return undefined
      if (key === 'first') return obj.start
      if (key === 'last') return obj.stop
      if (key === 'size') return obj.length
      return undefined
    }
    const value = readJSProperty(obj, key, this.ownPropertyOnly)
    if (value === undefined && obj instanceof Drop) return obj.liquidMethodMissing(key, this)
    if (isFunction(value)) return value.call(obj)
    if (obj instanceof Drop) return value
    if (value !== undefined || (!this.ownPropertyOnly && key in Object(obj)) || hasOwnProperty.call(obj, key)) return value
    if (allowCommand) {
      if (key === 'size') return readSize(obj)
      else if (key === 'first') return readFirst(obj, this.ownPropertyOnly)
      else if (key === 'last') return readLast(obj, this.ownPropertyOnly)
    }
    return value
  }
}

export function readJSProperty (obj: Scope, key: PropertyKey, ownPropertyOnly: boolean) {
  if (ownPropertyOnly && !hasOwnProperty.call(obj, key) && !(obj instanceof Drop)) return undefined
  return obj[key]
}
