import { CATEGORY_COLORS } from '@/lib/types'

interface Props {
  category: string
  size?: 'sm' | 'md'
}

export default function CategoryBadge({ category, size = 'sm' }: Props) {
  const c = CATEGORY_COLORS[category] ?? { bg: 'rgba(255,255,255,0.04)', text: '#666', border: '#252525' }
  return (
    <span
      className="inline-flex items-center font-medium whitespace-nowrap"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontSize: size === 'sm' ? '11px' : '12px',
        padding: size === 'sm' ? '1px 7px' : '2px 9px',
        borderRadius: '4px',
      }}
    >
      {category}
    </span>
  )
}
