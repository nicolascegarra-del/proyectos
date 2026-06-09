import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Nodo de imagen para las notas. Renderiza un `<img>` con `src` (admite data URI
 * base64 de imágenes pegadas) y un `width` opcional que permite redimensionarla.
 *
 * Es un nodo propio (no usa @tiptap/extension-image) para no añadir dependencias
 * nuevas; solo depende de @tiptap/core, ya presente de forma transitiva.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notaImage: {
      /** Inserta una imagen en la posición actual. */
      setNotaImage: (options: { src: string; alt?: string; width?: string }) => ReturnType
    }
  }
}

export const NotaImage = Node.create({
  name: 'notaImage',
  group: 'block',
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: {
        default: null,
        parseHTML: el =>
          (el as HTMLElement).style.width || (el as HTMLElement).getAttribute('width') || null,
        renderHTML: attrs => (attrs.width ? { style: `width: ${attrs.width}` } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },

  addCommands() {
    return {
      setNotaImage:
        options =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    }
  },
})
