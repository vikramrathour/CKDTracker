import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { ZodType, ZodTypeDef } from 'zod'

/**
 * Minimal react-hook-form resolver for zod (the @hookform/resolvers package
 * isn't installed). First issue per field wins; paths are nested the way RHF
 * expects (`a.b` → { a: { b: error } }). Form-level issues use path ['root'].
 */
export function zodResolver<TIn extends FieldValues, TOut extends FieldValues>(
  schema: ZodType<TOut, ZodTypeDef, TIn>
): Resolver<TIn, unknown, TOut> {
  return async (values) => {
    const result = await schema.safeParseAsync(values)
    if (result.success) return { values: result.data, errors: {} }

    const errors: Record<string, unknown> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.map(String) : ['root']
      let node = errors
      for (let i = 0; i < path.length - 1; i++) {
        node[path[i]] = (node[path[i]] as Record<string, unknown>) ?? {}
        node = node[path[i]] as Record<string, unknown>
      }
      const leaf = path[path.length - 1]
      if (node[leaf] === undefined) node[leaf] = { type: issue.code, message: issue.message }
    }
    return { values: {}, errors: errors as FieldErrors<TIn> }
  }
}
