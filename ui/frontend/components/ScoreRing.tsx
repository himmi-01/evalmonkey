'use client'
import { scoreColor } from '@/lib/types'

interface Props {
  score: number | null
  size?: number
  strokeWidth?: number
  showLabel?: boolean
  animate?: boolean
}

export default function ScoreRing({
  score,
  size = 64,
  strokeWidth = 5,
  showLabel = true,
  animate = true,
}: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0
  const offset = circumference - (pct / 100) * circumference
  const color = scoreColor(score)

  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="#1e1e1e"
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="score-ring-fill"
          style={{ transition: animate ? 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' : 'none' }}
        />
      </svg>
      {showLabel && (
        <span
          className="absolute font-semibold tabular-nums"
          style={{ color, fontSize: size < 52 ? '10px' : '13px', letterSpacing: '-0.02em' }}
        >
          {score !== null ? score : '—'}
        </span>
      )}
    </div>
  )
}
