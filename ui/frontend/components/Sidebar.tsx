'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, History, Plus } from 'lucide-react'

const navItems = [
  { href: '/',        label: 'Dashboard', icon: BarChart3 },
  { href: '/run/new', label: 'New Run',   icon: Plus },
  { href: '/history', label: 'History',   icon: History },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-56 flex flex-col z-50"
      style={{ background: '#0a0a0a', borderRight: '1px solid #1a1a1a' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14"
        style={{ borderBottom: '1px solid #1a1a1a' }}>
        <span className="text-base">🐵</span>
        <div>
          <span className="font-semibold text-white text-sm tracking-tight">EvalMonkey</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-all duration-100"
              style={{
                background:  active ? '#161616' : 'transparent',
                color:       active ? '#ffffff' : '#666666',
                borderRadius: '5px',
              }}
            >
              <Icon size={14} strokeWidth={1.8} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid #1a1a1a' }}>
        <span className="text-xs" style={{ color: '#3a3a3a' }}>Apache 2.0 · Open Source</span>
      </div>
    </aside>
  )
}
