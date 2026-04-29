import { createSafeActionClient } from 'next-safe-action'

export const action = createSafeActionClient({
  handleServerError(e) {
    return e instanceof Error ? e.message : 'Error desconocido'
  },
})
