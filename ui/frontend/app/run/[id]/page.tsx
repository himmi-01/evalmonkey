'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { RunSummary, SampleResult, SSEEvent, scoreColor } from '@/lib/types'
import ScoreRing from '@/components/ScoreRing'
import { SUPPORTED_BENCHMARK_CATEGORIES } from '@/lib/benchmarks'
import { ArrowLeft, CheckCircle, XCircle, Zap } from 'lucide-react'
import Link from 'next/link'

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [run, setRun] = useState<RunSummary | null>(null)
  const [samples, setSamples] = useState<SampleResult[]>([])
  const [currentScore, setCurrentScore] = useState<number | null>(null)
  const [status, setStatus] = useState<string>('running')
  const [statusMsg, setStatusMsg] = useState<string>('Initializing...')
  const [selected, setSelected] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getRun(id).then(r => { setRun(r); setStatus(r.status) }).catch(() => {})
  }, [id])

  useEffect(() => {
    // Connect directly to the backend — bypasses the Next.js dev-server proxy
    // which buffers SSE responses and causes "Waiting for first result..." to hang.
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080'
    const es = new EventSource(`${backendUrl}/api/run/${id}/stream`)
    es.onmessage = (e) => {
      try {
        const ev: SSEEvent = JSON.parse(e.data)
        if (ev.type === 'status' || ev.type === 'progress') {
          setStatusMsg(ev.message ?? '')
        } else if (ev.type === 'sample') {
          const s: SampleResult = {
            id: null, run_id: id,
            sample_index: ev.index ?? 0,
            eval_id: ev.eval_id ?? '',
            question: ev.question ?? '',
            agent_output: ev.agent_output ?? null,
            expected_rubric: ev.expected_rubric ?? null,
            score: ev.score ?? null,
            reasoning: ev.reasoning ?? null,
            chaos_profile: null,
            created_at: new Date().toISOString(),
          }
          setSamples(prev => prev.find(x => x.sample_index === s.sample_index) ? prev : [...prev, s])
          setCurrentScore(ev.current_score ?? null)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
        } else if (ev.type === 'complete') {
          setStatus('completed'); setCurrentScore(ev.final_score ?? null)
          setStatusMsg('Completed')
          api.getRun(id).then(r => setRun(r)).catch(() => {})
          es.close()
        } else if (ev.type === 'error') {
          setStatus('failed'); setStatusMsg(ev.message ?? 'Run failed')
          es.close()
        }
      } catch {}
    }
    es.onerror = () => {
      // On connection error, poll once to get the final run state from DB
      api.getRun(id).then(r => {
        setRun(r)
        setStatus(r.status)
        if (r.status === 'failed') setStatusMsg((r as any).details?.error ?? 'Run failed')
        if (r.status === 'completed') setStatusMsg('Completed')
      }).catch(() => {})
      es.close()
    }
    return () => es.close()
  }, [id])

  const finalScore = status === 'completed' ? (run?.score ?? currentScore) : currentScore
  const total = run?.sample_count ?? 0
  const progress = total > 0 ? (samples.length / total) * 100 : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs mb-6 transition-colors"
        style={{ color: '#555' }}>
        <ArrowLeft size={12} />Dashboard
      </Link>

      {/* Run header card */}
      <div className="card p-5 mb-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="mono text-base font-semibold text-white">{run?.scenario ?? id}</span>
              {run?.run_type === 'chaos' && (
                <span className="tag" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}>
                  <Zap size={9} />chaos
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: '#555' }}>
              <span>{run?.eval_model ?? '—'}</span>
              {run?.chaos_profile && <span style={{ color: '#ef4444' }}>⚡ {run.chaos_profile}</span>}
              <span className="mono truncate">{run?.target_url}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-3xl font-semibold tabular-nums" style={{ color: scoreColor(finalScore) }}>
              {finalScore !== null ? finalScore : '—'}
            </div>
            <div className="text-xs" style={{ color: '#555' }}>/ 100</div>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2" style={{ color: '#555' }}>
            <div className="flex items-center gap-1.5">
              {status === 'running'   && <span className="dot-live" />}
              {status === 'completed' && <CheckCircle size={11} style={{ color: '#22c55e' }} />}
              {status === 'failed'    && <XCircle size={11} style={{ color: '#ef4444' }} />}
              <span>{statusMsg}</span>
            </div>
            <span>{samples.length}/{total}</span>
          </div>
          <div className="h-1 rounded-full" style={{ background: '#1a1a1a' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: status === 'failed' ? '#ef4444'
                          : status === 'completed' ? '#22c55e'
                          : '#22c55e',
              }}
            />
          </div>
        </div>
      </div>

      {/* Sample results */}
      <div className="flex gap-5">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium mb-3" style={{ color: '#555' }}>SAMPLES</div>
          {samples.length === 0 ? (
            <div className="card p-10 text-center">
              {status === 'failed' ? (
                <>
                  <XCircle size={24} style={{ color: '#ef4444', margin: '0 auto 12px' }} />
                  <div className="text-sm font-medium text-white mb-1">Run failed</div>
                  <div className="text-xs leading-relaxed" style={{ color: '#ef4444', maxWidth: 340, margin: '0 auto' }}>
                    {statusMsg}
                  </div>
                  <Link href="/run/new" className="btn btn-primary mt-5 inline-flex">Try Again</Link>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 border-2 border-[#222] border-t-[#22c55e] rounded-full animate-spin mx-auto mb-3" />
                  <div className="text-xs" style={{ color: '#555' }}>{statusMsg || 'Waiting for first result...'}</div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {samples.map((s, i) => {
                const col = scoreColor(s.score)
                const open = selected === s.sample_index
                return (
                  <div
                    key={s.sample_index}
                    className="card card-hover row-animate cursor-pointer transition-all"
                    style={{ animationDelay: `${i * 0.03}s`, borderColor: open ? '#333' : undefined }}
                    onClick={() => setSelected(open ? null : s.sample_index)}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {/* Index */}
                      <div className="w-6 h-6 flex items-center justify-center text-xs flex-shrink-0"
                        style={{ color: '#444', background: '#161616', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.sample_index + 1}
                      </div>

                      {/* Question */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{s.question}</div>
                        {s.agent_output && (
                          <div className="text-xs truncate mt-0.5" style={{ color: '#555' }}>
                            ↳ {s.agent_output}
                          </div>
                        )}
                      </div>

                      {/* Score */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-base font-semibold tabular-nums" style={{ color: col }}>
                          {s.score ?? '…'}
                        </div>
                      </div>
                    </div>

                    {/* Expanded */}
                    {open && (
                      <div className="px-3 pb-4 pt-1 border-t space-y-3 text-xs" style={{ borderColor: '#1e1e1e' }}>
                        <div>
                          <div className="font-medium mb-1" style={{ color: '#555' }}>QUESTION</div>
                          <div className="text-white leading-relaxed whitespace-pre-wrap">{s.question}</div>
                        </div>
                        <div>
                          <div className="font-medium mb-1" style={{ color: '#555' }}>AGENT OUTPUT</div>
                          <div className="leading-relaxed whitespace-pre-wrap" style={{ color: '#888' }}>{s.agent_output || '(none)'}</div>
                        </div>
                        <div>
                          <div className="font-medium mb-1" style={{ color: '#555' }}>EXPECTED</div>
                          <div className="leading-relaxed" style={{ color: '#888' }}>{s.expected_rubric}</div>
                        </div>
                        <div className="p-3 rounded" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
                          <div className="font-medium mb-1" style={{ color: '#555' }}>JUDGE REASONING</div>
                          <div className="leading-relaxed" style={{ color: '#888' }}>{s.reasoning || '—'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Breakdown (complete only) */}
        {status === 'completed' && samples.length > 0 && (
          <div className="w-48 flex-shrink-0 space-y-3">
            <div className="text-xs font-medium" style={{ color: '#555' }}>BREAKDOWN</div>
            <div className="card p-4 space-y-3">
              {[
                { label: '90–100', min: 90, max: 101, col: '#4ade80' },
                { label: '75–89',  min: 75, max: 90,  col: '#22c55e' },
                { label: '50–74',  min: 50, max: 75,  col: '#f59e0b' },
                { label: '0–49',   min: 0,  max: 50,  col: '#ef4444' },
              ].map(({ label, min, max, col }) => {
                const count = samples.filter(s => (s.score ?? 0) >= min && (s.score ?? 0) < max).length
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1" style={{ color: '#555' }}>
                      <span>{label}</span>
                      <span style={{ color: col }}>{count}</span>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: '#1a1a1a' }}>
                      <div className="h-full rounded-full" style={{ width: `${(count / samples.length) * 100}%`, background: col }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <Link href="/run/new" className="btn w-full justify-center text-xs py-1.5">Run Again</Link>
            <Link href="/history" className="btn w-full justify-center text-xs py-1.5">History</Link>
          </div>
        )}
      </div>
    </div>
  )
}
