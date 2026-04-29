'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'

export async function updateDefaultRate(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const raw = formData.get('rate')
  if (typeof raw !== 'string') return

  const trimmed = raw.trim()
  const parsed = parseFloat(trimmed)
  if (isNaN(parsed) || parsed <= 0 || parsed >= 1) return

  const adminClient = createAdminClient()
  await adminClient.from('settings').upsert({
    key: 'default_annual_rate',
    value: trimmed,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  })

  revalidatePath('/admin/settings')
}
