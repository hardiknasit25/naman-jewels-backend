// A typed error carrying an HTTP status code, thrown from controllers and
// translated to a JSON response by the error-handling middleware.
export class HttpError extends Error {
  status: number
  /**
   * Optional machine-readable reason, surfaced as `code` in the JSON body. Lets a
   * client branch on *why* a request failed rather than string-matching `message`
   * — e.g. the customer app showing a different screen for a 'pending' account
   * than for a wrong password. Omitted for ordinary errors, so responses that
   * don't set it keep their existing `{ message }` shape.
   */
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'HttpError'
  }
}
