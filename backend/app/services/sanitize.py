"""Sanitización de HTML enriquecido (descripcion_larga de Tarea).

Permitimos un subconjunto seguro de etiquetas y atributos: formatos básicos
(negrita, cursiva, subrayado), listas, párrafos y `<span style="...">` con
`font-family`/`font-size` para los selectores del editor TipTap.

Si la dependencia `bleach` no está instalada (entorno mínimo), caemos a un
sanitizador básico de respaldo que elimina cualquier etiqueta no permitida.
"""

from __future__ import annotations

import re
from typing import Optional

ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u",
    "ol", "ul", "li", "span",
}
ALLOWED_ATTRIBUTES = {
    "span": {"style"},
}

# CSS permitido dentro de style="...": solo font-family y font-size con valores
# alfanuméricos / px / comillas / espacios / comas. Cualquier otra propiedad se
# descarta.
_CSS_RULE_RE = re.compile(
    r"^\s*(font-family|font-size)\s*:\s*([A-Za-z0-9 ,'\"\-\.]+)\s*$",
    re.IGNORECASE,
)


def _filter_style(style_value: str) -> str:
    safe_rules: list[str] = []
    for raw in style_value.split(";"):
        if not raw.strip():
            continue
        m = _CSS_RULE_RE.match(raw)
        if m:
            prop = m.group(1).lower()
            value = m.group(2).strip()
            safe_rules.append(f"{prop}: {value}")
    return "; ".join(safe_rules)


try:
    import bleach  # type: ignore

    def sanitize_html(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        cleaned = bleach.clean(
            value,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRIBUTES,
            strip=True,
            strip_comments=True,
        )
        # bleach no filtra propiedades CSS por defecto sin css_sanitizer extra;
        # aplicamos una pasada manual sobre style="..." para dejar solo
        # font-family/font-size.
        return re.sub(
            r'style="([^"]*)"',
            lambda m: f'style="{_filter_style(m.group(1))}"',
            cleaned,
        )

except ImportError:  # pragma: no cover - fallback minimalista
    _TAG_RE = re.compile(r"</?([a-zA-Z]+)([^>]*)>")

    def sanitize_html(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None

        def _replace(match: re.Match) -> str:
            tag = match.group(1).lower()
            attrs = match.group(2)
            if tag not in ALLOWED_TAGS:
                return ""
            if tag == "span" and 'style=' in attrs:
                style_match = re.search(r'style="([^"]*)"', attrs)
                if style_match:
                    safe = _filter_style(style_match.group(1))
                    return f'<span style="{safe}">' if not match.group(0).startswith("</") else "</span>"
            if match.group(0).startswith("</"):
                return f"</{tag}>"
            return f"<{tag}>"

        return _TAG_RE.sub(_replace, value)
