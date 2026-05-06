import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'EvalMonkey — Agent Benchmarking',
  description: 'Run standard benchmarks and chaos tests against your AI agents. Track reliability over time.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen" style={{ background: '#0a0a0a', color: '#fff' }}>
        <Sidebar />
        <main className="flex-1 ml-56 min-h-screen overflow-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
