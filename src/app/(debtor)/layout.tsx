import { requireUser } from '@/lib/auth/session'

export default async function DebtorLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <>{children}</>
}
