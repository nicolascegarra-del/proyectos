import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

interface RichTextViewProps {
  html: string | null | undefined
  className?: string
}

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ol', 'ul', 'li', 'span', 'img']
const ALLOWED_ATTR = ['style', 'src', 'alt', 'width', 'height']

export function RichTextView({ html, className }: RichTextViewProps) {
  if (!html) return null
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Permite <img src="data:image/...;base64,..."> de imágenes pegadas.
    ADD_DATA_URI_TAGS: ['img'],
    ALLOWED_CSS_PROPERTIES: ['font-family', 'font-size', 'width', 'height', 'max-width'],
  } as never)
  return (
    <div
      className={cn('rich-text-content prose prose-sm max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
