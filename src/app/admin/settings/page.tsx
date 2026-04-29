import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/session'
import { updateDefaultRate } from './actions'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireAdmin()

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('settings')
    .select('value')
    .eq('key', 'default_annual_rate')
    .single()

  // JSONB string value is deserialized by Supabase as a JS string e.g. "0.24"
  const currentRate = typeof data?.value === 'string' ? data.value : '0.24'

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-gray-900">Configuración</h1>

      <section className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-1 text-base font-semibold text-gray-800">
          Tasa de interés anual predeterminada
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          Solo aplica a nuevas conversiones de cuotas. Las deudas existentes conservan su tasa
          registrada.
        </p>
        <form action={updateDefaultRate} className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="rate" className="mb-1 block text-sm font-medium text-gray-700">
              Tasa (ej: 0.24 = 24% anual)
            </label>
            <input
              id="rate"
              name="rate"
              type="number"
              step="0.01"
              min="0.01"
              max="0.99"
              defaultValue={currentRate}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Guardar
          </button>
        </form>
      </section>
    </main>
  )
}
