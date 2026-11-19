import { isFalsy, isTruthy } from '../render/boolean'
import { EmptyDrop } from '../drop/empty-drop'
import { isKeyValuePair } from '../parser/filter-arg'
import { LiquidRuntimeError } from '../util/error'
import { identify, isArray, isString, toValue } from '../util/underscore'
import { FilterImpl } from '../template'

function isPlainHash (val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object') return false
  const proto = Object.getPrototypeOf(val)
  return proto === null || proto === Object.prototype
}

function chargeJsonReplacerValue (memoryLimit: { use(count: number): void }, val: unknown) {
  if (typeof val === 'string') {
    memoryLimit.use(val.length)
  } else if (val === null || typeof val === 'number' || typeof val === 'boolean') {
    memoryLimit.use(JSON.stringify(val).length)
  } else if (Array.isArray(val)) {
    memoryLimit.use(val.length + 1)
  } else if (typeof val === 'object') {
    memoryLimit.use(2)
  }
}

function defaultFilter (this: FilterImpl, value: unknown, ...rawArgs: unknown[]): unknown {
  const args: unknown[] = []
  let kwargs: Record<string, unknown> | undefined
  const tokenArgs = this?.token?.args
  if (Array.isArray(tokenArgs) && tokenArgs.length === rawArgs.length) {
    for (let i = 0; i < rawArgs.length; i++) {
      if (isKeyValuePair(tokenArgs[i])) {
        const [k, val] = rawArgs[i] as [string, unknown]
        if (!kwargs) kwargs = {}
        kwargs[k] = val
      } else {
        args.push(rawArgs[i])
      }
    }
  } else {
    for (const arg of rawArgs) {
      if (isArray(arg) && arg.length === 2 && isString(arg[0])) {
        if (!kwargs) kwargs = {}
        kwargs[arg[0]] = arg[1]
      } else {
        args.push(arg)
      }
    }
  }
  if (kwargs) args.push(kwargs)
  const given = 1 + args.length
  if (given > 3) {
    throw new LiquidRuntimeError(`wrong number of arguments (given ${given}, expected 1..3)`)
  }
  const defaultValue = args.length >= 1 ? args[0] : ''
  const options = args.length >= 2 && isPlainHash(args[1]) ? args[1] : {}
  const resolved = toValue(value)
  if (isArray(resolved) || isString(resolved)) return resolved.length ? value : defaultValue
  if (resolved instanceof EmptyDrop || (isPlainHash(resolved) && Object.keys(resolved).length === 0)) {
    return defaultValue
  }
  const allowFalse = isTruthy(toValue(options.allow_false), this.context)
  if (resolved === false && allowFalse) return false
  return isFalsy(resolved, this.context) ? defaultValue : value
}

function json (this: FilterImpl, value: any, space = 0) {
  const memoryLimit = this.context.memoryLimit
  return JSON.stringify(value, (_key, val) => {
    chargeJsonReplacerValue(memoryLimit, val)
    return val
  }, space)
}

function inspect (this: FilterImpl, value: any, space = 0) {
  const memoryLimit = this.context.memoryLimit
  const ancestors: object[] = []
  return JSON.stringify(value, function (this: unknown, _key: unknown, value: any) {
    if (typeof value !== 'object' || value === null) {
      chargeJsonReplacerValue(memoryLimit, value)
      return value
    }
    // `this` is the object that value is contained in, i.e., its direct parent.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop()
    if (ancestors.includes(value)) {
      memoryLimit.use('[Circular]'.length)
      return '[Circular]'
    }
    ancestors.push(value)
    chargeJsonReplacerValue(memoryLimit, value)
    return value
  }, space)
}

function to_integer (value: any) {
  return Number(value)
}

const raw = {
  raw: true,
  handler: identify
}

export default {
  default: defaultFilter,
  raw,
  jsonify: json,
  to_integer,
  json,
  inspect
}
