'use client'
import { useAction } from 'next-safe-action/hooks'
import { createInvite } from '@/lib/auth/actions'
import { useState } from 'react'

export function CreateInviteForm() {
  const [email, setEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { execute, isPending, result } = useAction(createInvite, {
    onSuccess: ({ data }) => {
      if (data?.token) {
        setGeneratedLink(`${window.location.origin}/invite/${data.token}`)
        setEmail('')
      }
    },
  })

  async function handleCopy() {
    if (!generatedLink) return
    await navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Crear invitación</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          execute({ email })
        }}
        className="flex gap-3"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Creando...' : 'Invitar'}
        </button>
      </form>

      {result?.serverError && (
        <p className="mt-3 text-sm text-red-600">{result.serverError}</p>
      )}

      {generatedLink && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Enlace de invitación:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white p-2 text-xs text-gray-800 ring-1 ring-gray-200">
              {generatedLink}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
