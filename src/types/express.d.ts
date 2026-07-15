// Attach the authenticated admin to the Express request object.
declare namespace Express {
  interface AuthAdmin {
    id: number
    email: string
    name: string
    sessionDuration: string
  }
  // The signed-in customer-app user. Kept separate from `admin` so an endpoint can
  // never confuse a customer token for an admin one — the two auth middlewares
  // populate different properties and no route reads both.
  interface AuthCustomer {
    id: number
    email: string
    companyName: string
    customerTypeId: number | null
    status: string
  }
  interface Request {
    admin?: AuthAdmin
    customer?: AuthCustomer
  }
}
