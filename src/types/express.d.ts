// Attach the authenticated admin to the Express request object.
declare namespace Express {
  interface AuthAdmin {
    id: number
    email: string
    name: string
    sessionDuration: string
  }
  interface Request {
    admin?: AuthAdmin
  }
}
