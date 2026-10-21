/** An expected, user-facing failure: printed without a stack trace. */
export class PushlogError extends Error {
  override name = 'PushlogError'
}
