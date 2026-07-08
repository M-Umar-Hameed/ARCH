export class AuthError extends Error {}
export class NotFoundError extends Error {}
export class StaleVersionError extends Error {}
export class ConflictError extends Error {}
export class ApiError extends Error {
  constructor(message: string, public status: number, public unreachable = false) { super(message); }
}
