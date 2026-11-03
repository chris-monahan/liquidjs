import { AssertionError, LiquidError, LiquidRuntimeError, ResourceLimitError, UndefinedVariableError } from '../util/error'

/** An error caught by `inlineErrors`, as passed to `formatError` */
export interface InlineError {
  /** `internal` unless the error is a Liquid error */
  message: string;
  line?: number;
  /** The file of the failing template, if any */
  templateName?: string;
  /** Raised when parsing, e.g. a partial with invalid syntax */
  syntax: boolean;
  error: LiquidError;
}

/** Formats like Shopify/liquid: `Liquid error (snippet line 3): divided by 0` */
export function formatInlineError ({ message, line, templateName, syntax }: InlineError): string {
  const kind = syntax ? 'Liquid syntax error' : 'Liquid error'
  const where = line === undefined ? '' : ` (${templateName ? `${templateName} ` : ''}line ${line})`
  return `${kind}${where}: ${message}`
}

export function describeError (error: LiquidError): InlineError {
  const [line] = error.token.getPosition()
  return {
    message: isPublic(error) ? publicMessage(error) : 'internal',
    line,
    templateName: error.token.file,
    syntax: error.name === 'ParseError' || error.name === 'TokenizationError',
    error
  }
}

export function isFatal (error: unknown): boolean {
  return error instanceof ResourceLimitError ||
    (LiquidError.is(error) && error.originalError instanceof ResourceLimitError)
}

export function isSilent (error: LiquidError): boolean {
  return error instanceof UndefinedVariableError
}

function isPublic (error: LiquidError) {
  const original = error.originalError
  if (!original) return true
  return original instanceof LiquidRuntimeError || original instanceof AssertionError ||
    LiquidError.is(original) || original.name === 'InternalUndefinedVariableError'
}

function publicMessage (error: LiquidError) {
  const original = error.originalError
  if (original && LiquidError.is(original)) return original.rawMessage
  return original ? original.message : error.rawMessage
}
