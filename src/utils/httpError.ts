// A typed error carrying an HTTP status code, thrown from controllers and
// translated to a JSON response by the error-handling middleware.
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}
