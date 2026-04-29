import { Suspense } from 'react'
import { SignInButton } from './_components/sign-in-button'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">AlexTePresta</h1>
        <p className="mb-8 text-center text-sm text-gray-500">Ingrese a su cuenta</p>
        <div className="flex justify-center">
          <Suspense>
            <SignInButton />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
