'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { RunSummary, scoreColor } from '@/lib/types'
import RunCard from '@/components/RunCard'
import ScoreRing from '@/components/ScoreRing'
import { Plus, RefreshCw } from 'lucide-react'

export default function DashboardPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [reliability, setReliability] = useState<Record<string, { reliability: number }>>({})
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const [runsData, relData] = await Promise.all([api.listRuns(30), api.getReliability()])
      setRuns(runsData)
      setReliability(relData)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 5000)
    return () => clearInterval(iv)
  }, [])

  const overall = Object.values(reliability).length
    ? Math.round(Object.values(reliability).reduce((s, v) => s + v.reliability, 0) / Object.values(reliability).length)
    : null

  const running   = runs.filter(r => r.status === 'running')
  const completed = runs.filter(r => r.status === 'completed')
  const avgScore  = completed.length
    ? Math.round(completed.reduce((s, r) => s + (r.score ?? 0), 0) / completed.length)
    : null

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white mb-0.5">Dashboard</h1>
          <p className="text-sm" style={{ color: '#555' }}>Agent benchmark scores &amp; reliability</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn">
            <RefreshCw size={13} />Refresh
          </button>
          <Link href="/run/new" className="btn btn-primary">
            <Plus size={13} />New Run
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {/* Reliability */}
        <div className="card p-5">
          <div className="text-xs font-medium mb-4" style={{ color: '#555' }}>PRODUCTION RELIABILITY</div>
          <div className="flex items-center gap-4">
            <ScoreRing score={overall} size={72} strokeWidth={6} />
            <div>
              <div className="text-2xl font-semibold text-white tabular-nums">
                {overall !== null ? overall : '—'}<span className="text-base font-normal" style={{ color: '#555' }}>/100</span>
              </div>
              <div className="text-xs mt-1" style={{ color: '#555' }}>60% baseline · 40% chaos</div>
            </div>
          </div>
        </div>

        {/* Avg score */}
        <div className="card p-5">
          <div className="text-xs font-medium mb-4" style={{ color: '#555' }}>AVG SCORE</div>
          <div className="text-2xl font-semibold text-white tabular-nums">
            {avgScore !== null ? avgScore : '—'}
            <span className="text-base font-normal" style={{ color: '#555' }}>/100</span>
          </div>
          <div className="text-xs mt-1" style={{ color: '#555' }}>{completed.length} completed</div>
        </div>

        {/* Active */}
        <div className="card p-5">
          <div className="text-xs font-medium mb-4" style={{ color: '#555' }}>ACTIVE RUNS</div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-semibold text-white tabular-nums">{running.length}</div>
            {running.length > 0 && <span className="dot-live" />}
          </div>
          <div className="text-xs mt-1" style={{ color: '#555' }}>in progress</div>
        </div>
      </div>

      {/* Live runs */}
      {running.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="dot-live" />
            <span className="text-xs font-medium" style={{ color: '#555' }}>LIVE RUNS</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {running.map(r => <RunCard key={r.id} run={r} />)}
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium" style={{ color: '#555' }}>RECENT RUNS</span>
          <Link href="/history" className="text-xs transition-colors" style={{ color: '#555' }}>
            All history →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card h-32 animate-pulse" style={{ background: '#111' }} />
            ))}
          </div>
        ) : completed.length === 0 ? (
          <div className="card p-14 text-center">
            <div className="text-3xl mb-3">🐵</div>
            <div className="text-sm font-medium text-white mb-1">No runs yet</div>
            <div className="text-xs mb-5" style={{ color: '#555' }}>
              Run your first benchmark to track agent reliability
            </div>
            <Link href="/run/new" className="btn btn-primary">
              <Plus size={13} />Run First Benchmark
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {completed.map(r => <RunCard key={r.id} run={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
