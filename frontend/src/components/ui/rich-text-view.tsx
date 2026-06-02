import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

interface RichTextViewProps {
  html: string | null | undefined
  className?: string
}

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ol', 'ul', 'li', 'span']
const ALLOWED_ATTR = ['style']

export function RichTextView({ html, className }: RichTextViewProps) {
  if (!html) return null
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_CSS_PROPERTIES: ['font-family', 'font-size'],
  } as never)
  return (
    <div
      className={cn('prose prose-sm max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
