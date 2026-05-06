'use client'
import Link from 'next/link'
import { RunSummary, scoreColor } from '@/lib/types'
import ScoreRing from './ScoreRing'
import { SUPPORTED_BENCHMARK_CATEGORIES } from '@/lib/benchmarks'
import { Zap } from 'lucide-react'

interface Props { run: RunSummary }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function RunCard({ run }: Props) {
  const col = scoreColor(run.status === 'running' ? null : run.score)

  return (
    <Link
      href={`/run/${run.id}`}
      className="card card-hover block p-4 transition-all duration-100"
      style={{ textDecoration: 'none' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="mono text-sm font-medium text-white">{run.scenario}</span>
            {run.run_type === 'chaos' && (
              <span className="tag" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}>
                <Zap size={9} strokeWidth={2.5} />chaos
              </span>
            )}
          </div>
          <span className="tag">{SUPPORTED_BENCHMARK_CATEGORIES[run.scenario] ?? 'Research'}</span>
        </div>
        <ScoreRing score={run.status === 'running' ? null : run.score} size={52} strokeWidth={4} />
      </div>

      {/* Progress bar (only when running) */}
      {run.status === 'running' && (
        <div className="mb-3">
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: '#1e1e1e' }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${run.sample_count ? (run.completed_samples / run.sample_count) * 100 : 0}%`,
                background: '#22c55e',
              }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs" style={{ color: '#444' }}>
        <span>{timeAgo(run.created_at)}</span>
        <span style={{
          color: run.status === 'running'  ? '#22c55e'
               : run.status === 'failed'   ? '#ef4444'
               : '#444',
        }}>
          {run.status === 'running'  ? '● running'
         : run.status === 'failed'   ? '✕ failed'
         : `${run.sample_count} samples`}
        </span>
      </div>
    </Link>
  )
}
