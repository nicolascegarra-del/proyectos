import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'

const FONT_FAMILIES = [
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Nunito', value: 'Nunito, system-ui, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, monospace' },
]

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px']

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-accent text-foreground/70 hover:text-foreground transition-colors',
        active && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function getFontSizeMark(editor: Editor): string {
  const attrs = editor.getAttributes('textStyle')
  return (attrs.fontSize as string) || ''
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            fontSize: {
              default: null,
              parseHTML: el => (el as HTMLElement).style.fontSize || null,
              renderHTML: attrs => {
                if (!attrs.fontSize) return {}
                return { style: `font-size: ${attrs.fontSize}` }
              },
            },
          }
        },
      }),
      FontFamily.configure({ types: ['textStyle'] }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2',
      },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML() && value !== editor.getHTML().replace('<p></p>', '')) {
      editor.commands.setContent(value || '', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  if (!editor) return null

  const setFontSize = (size: string) => {
    if (!size) {
      editor.chain().focus().setMark('textStyle', { fontSize: null }).run()
    } else {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run()
    }
  }

  const setFontFamily = (family: string) => {
    if (!family) {
      editor.chain().focus().unsetFontFamily().run()
    } else {
      editor.chain().focus().setFontFamily(family).run()
    }
  }

  const currentFamily = editor.getAttributes('textStyle').fontFamily || ''
  const currentSize = getFontSizeMark(editor)

  return (
    <div className={cn('border rounded-md bg-background', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <ToolbarButton
          title="Negrita"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Cursiva"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Subrayado"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          title="Lista con viñetas"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Lista numerada"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-border" />

        <select
          value={currentFamily}
          onChange={e => setFontFamily(e.target.value)}
          className="h-7 rounded border bg-background px-1 text-xs"
          title="Tipo de letra"
        >
          <option value="">Fuente</option>
          {FONT_FAMILIES.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <select
          value={currentSize}
          onChange={e => setFontSize(e.target.value)}
          className="h-7 rounded border bg-background px-1 text-xs"
          title="Tamaño de letra"
        >
          <option value="">Tamaño</option>
          {FONT_SIZES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  )
}
