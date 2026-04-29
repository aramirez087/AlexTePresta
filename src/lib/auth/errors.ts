export class AuthRequiredError extends Error {
  readonly code = 'AUTH_REQUIRED' as const
  constructor() {
    super('Autenticación requerida')
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const
  constructor() {
    super('Acceso no autorizado')
  }
}
