export const dynamic = 'force-dynamic'

import { SubmitPaymentForm } from './_components/submit-payment-form'

export default function PayPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Registrar pago</h1>
      <p className="mb-6 text-sm text-gray-600">
        Ingrese el monto que desea abonar. El administrador revisará y aprobará su pago.
      </p>
      <SubmitPaymentForm />
    </main>
  )
}
