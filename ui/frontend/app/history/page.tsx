'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { HistoryEntry, RunSummary, scoreColor } from '@/lib/types'
import { SUPPORTED_BENCHMARK_CATEGORIES } from '@/lib/benchmarks'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { Plus } from 'lucide-react'

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs" style={{ background: '#111', border: '1px solid #252525' }}>
      <div style={{ color: '#555' }}>{new Date(payload[0]?.payload?.date).toLocaleDateString()}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }} className="font-medium mt-0.5">
          {p.value}/100
        </div>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [reliability, setReliability] = useState<Record<string, { reliability: number; baseline_count: number; chaos_count: number }>>({})
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.listRuns(100), api.getHistory(), api.getReliability()])
      .then(([r, h, rel]) => { setRuns(r); setHistory(h); setReliability(rel) })
      .finally(() => setLoading(false))
  }, [])

  const completed = runs.filter(r => r.status === 'completed')
  const scenarios = Array.from(new Set(completed.map(r => r.scenario)))
  const displayScenario = selectedScenario ?? scenarios[0] ?? null

  const chartData = history
    .filter(h => h.scenario === displayScenario)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(h => ({ date: h.timestamp, score: h.score, type: h.run_type }))

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-white mb-0.5">History</h1>
          <p className="text-sm" style={{ color: '#555' }}>Reliability trends over time</p>
        </div>
        <Link href="/run/new" className="btn btn-primary">
          <Plus size={13} />New Run
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse" />)}
        </div>
      ) : completed.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="text-3xl mb-3">📊</div>
          <div className="text-sm font-medium text-white mb-1">No history yet</div>
          <div className="text-xs mb-5" style={{ color: '#555' }}>Complete your first run to see trends here</div>
          <Link href="/run/new" className="btn btn-primary"><Plus size={13} />Run a Benchmark</Link>
        </div>
      ) : (
        <>
          {/* Scenario reliability tiles */}
          <div className="mb-6">
            <div className="text-xs font-medium mb-3" style={{ color: '#555' }}>RELIABILITY BY SCENARIO</div>
            <div className="grid grid-cols-4 gap-2">
              {scenarios.map(s => {
                const rel = reliability[s]
                const score = rel ? Math.round(rel.reliability) : null
                const active = displayScenario === s
                return (
                  <button
                    key={s}
                    onClick={() => setSelectedScenario(s)}
                    className="card card-hover text-left p-4 transition-all"
                    style={{ borderColor: active ? '#333' : undefined }}
                  >
                    <div className="mono text-xs font-semibold text-white mb-2">{s}</div>
                    <div className="flex items-end justify-between">
                      <div className="text-xl font-semibold tabular-nums" style={{ color: scoreColor(score) }}>
                        {score ?? '—'}
                      </div>
                      <div className="text-xs" style={{ color: '#3a3a3a' }}>
                        {rel ? `${rel.baseline_count}B ${rel.chaos_count}C` : '—'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Chart */}
          {displayScenario && chartData.length > 0 && (
            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm font-medium text-white">{displayScenario}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#555' }}>Score over time</div>
                </div>
                {reliability[displayScenario] && (
                  <div className="text-right">
                    <div className="text-xs mb-0.5" style={{ color: '#555' }}>Reliability</div>
                    <div className="text-xl font-semibold" style={{ color: scoreColor(Math.round(reliability[displayScenario].reliability)) }}>
                      {Math.round(reliability[displayScenario].reliability)}
                    </div>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    tick={{ fill: '#444', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis domain={[0, 100]} tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={70} stroke="#2a2a2a" strokeDasharray="4 4" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2}
                    dot={{ fill: '#22c55e', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: '#4ade80' }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-xs mt-1.5" style={{ color: '#3a3a3a' }}>
                — 70% minimum threshold
              </div>
            </div>
          )}

          {/* Runs table */}
          <div>
            <div className="text-xs font-medium mb-3" style={{ color: '#555' }}>ALL RUNS</div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                    {['Scenario', 'Type', 'Score', 'Samples', 'Judge', 'Date', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#444' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completed.map((r, i) => (
                    <tr
                      key={r.id}
                      style={{ borderBottom: i < completed.length - 1 ? '1px solid #141414' : undefined }}
                      className="transition-colors"
                    >
                      <td className="px-4 py-3 mono text-xs font-medium text-white">{r.scenario}</td>
                      <td className="px-4 py-3">
                        <span className="tag" style={r.run_type === 'chaos' ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)' } : {}}>
                          {r.run_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold tabular-nums" style={{ color: scoreColor(r.score) }}>
                          {r.score ?? '—'}
                        </span>
                        <span className="text-xs ml-1" style={{ color: '#3a3a3a' }}>/100</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#555' }}>{r.sample_count}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: '#444' }}>{r.eval_model.split('/').pop()}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#444' }}>
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/run/${r.id}`} className="text-xs transition-colors" style={{ color: '#555' }}>
                          Details →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
