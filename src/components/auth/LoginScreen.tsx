import { Suspense, lazy } from 'react'
import LoginCard from './LoginCard'

const LoginBackground = lazy(() => import('./LoginBackground'))

export default function LoginScreen() {
  return (
    <div className="relative flex items-center justify-center h-screen overflow-hidden">
      <Suspense fallback={<div className="absolute inset-0 bg-[#080909]" />}> 
        <LoginBackground />
      </Suspense>
      <div className="relative z-10 w-full px-6 flex justify-center">
        <LoginCard />
      </div>
    </div>
  )
}
