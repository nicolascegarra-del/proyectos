"""Tests para las mejoras v3:
- M1: assigned_to en Tarea (validación miembro proyecto)
- M2: user_id en Comentario (autor poblado)
- M3: NotaProyecto con HTML sanitizado
- M4: tipo en NotaProyecto (default + persist + filtrado por valor)
- M5: estado, descripcion y fechas en Proyecto
"""
import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    Cliente,
    Comentario,
    KanbanEstado,
    NotaProyecto,
    Proyecto,
    ProyectoMiembro,
    Tag,
    Tarea,
    User,
    Workspace,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _add_proyecto_miembro(session: AsyncSession, proyecto: Proyecto, user: User) -> ProyectoMiembro:
    m = ProyectoMiembro(proyecto_id=proyecto.id, user_id=user.id, horas_semana=0)
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


# ── M1: assigned_to en Tarea ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_crear_tarea_assigned_to_miembro_valido(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    user: User, kanban_estado: KanbanEstado,
):
    await _add_proyecto_miembro(session, proyecto, user)

    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas",
        json={
            "descripcion": "Tarea asignada",
            "horas": 2,
            "fecha": str(date.today()),
            "assigned_to": str(user.id),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["assigned_to"] == str(user.id)
    assert body["assigned_to_nombre"] == user.nombre


@pytest.mark.asyncio
async def test_crear_tarea_assigned_to_no_miembro_da_400(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto, user: User,
    kanban_estado: KanbanEstado,
):
    # user es miembro del workspace pero NO del proyecto
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas",
        json={
            "descripcion": "Tarea asignada",
            "horas": 1,
            "fecha": str(date.today()),
            "assigned_to": str(user.id),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "miembro" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_tarea_quita_assigned_to(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    user: User, kanban_estado: KanbanEstado,
):
    await _add_proyecto_miembro(session, proyecto, user)
    tarea = Tarea(
        proyecto_id=proyecto.id, descripcion="t", horas=1, fecha=date.today(),
        assigned_to=user.id, estado_kanban=kanban_estado.id,
    )
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    resp = await client.put(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{tarea.id}",
        json={"assigned_to": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["assigned_to"] is None


# ── M2: user_id en Comentario ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_crear_comentario_persiste_user_id_y_autor(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    user: User, kanban_estado: KanbanEstado,
):
    tarea = Tarea(
        proyecto_id=proyecto.id, descripcion="t", horas=1, fecha=date.today(),
        estado_kanban=kanban_estado.id,
    )
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{tarea.id}/comentarios",
        json={"texto": "Primera nota"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user_id"] == str(user.id)
    assert body["autor_nombre"] == user.nombre

    persisted = (
        await session.exec(select(Comentario).where(Comentario.id == uuid.UUID(body["id"])))
    ).first()
    assert persisted is not None
    assert persisted.user_id == user.id


@pytest.mark.asyncio
async def test_listar_comentarios_devuelve_autor(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    user: User, kanban_estado: KanbanEstado,
):
    tarea = Tarea(
        proyecto_id=proyecto.id, descripcion="t", horas=1, fecha=date.today(),
        estado_kanban=kanban_estado.id,
    )
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{tarea.id}/comentarios",
        json={"texto": "uno"},
        headers=auth_headers,
    )
    resp = await client.get(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{tarea.id}/comentarios",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    arr = resp.json()
    assert len(arr) == 1
    assert arr[0]["autor_nombre"] == user.nombre


# ── M3: HTML sanitizado en NotaProyecto ──────────────────────────────────────


@pytest.mark.asyncio
async def test_crear_nota_html_basico_se_conserva(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>Hola <strong>mundo</strong></p>"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert "<strong>mundo</strong>" in resp.json()["texto"]


@pytest.mark.asyncio
async def test_crear_nota_html_malicioso_se_elimina(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>seguro</p><script>alert(1)</script>"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    texto = resp.json()["texto"]
    # las etiquetas <script> deben desaparecer; el texto interno se elimina con strip=True
    assert "<script>" not in texto
    assert "<p>seguro</p>" in texto


@pytest.mark.asyncio
async def test_crear_nota_html_vacio_da_400(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p></p>"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


# ── M4: etiquetas en NotaProyecto ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_nota_sin_etiquetas_por_defecto(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>n</p>"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["tags"] == []


@pytest.mark.asyncio
async def test_nota_con_etiqueta_se_persiste_y_devuelve(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    user: User,
):
    tag = Tag(workspace_id=workspace.id, user_id=user.id, nombre="Reunión", color="#EAB308")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)

    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>n</p>", "tag_ids": [str(tag.id)]},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    tags = resp.json()["tags"]
    assert len(tags) == 1
    assert tags[0]["nombre"] == "Reunión"

    # Filtrado por etiqueta
    resp_filtro = await client.get(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas?tag_id={tag.id}",
        headers=auth_headers,
    )
    assert resp_filtro.status_code == 200
    assert len(resp_filtro.json()) == 1


# ── M5: estado, descripcion y fechas en Proyecto ─────────────────────────────


@pytest.mark.asyncio
async def test_crear_proyecto_defaults_estado_activo(
    client, auth_headers, workspace: Workspace, cliente: Cliente,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos",
        json={"cliente_id": str(cliente.id), "nombre": "Nuevo proyecto"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["estado"] == "activo"
    assert body["descripcion"] is None
    assert body["fecha_inicio"] is None
    assert body["fecha_fin_estimada"] is None


@pytest.mark.asyncio
async def test_crear_proyecto_con_metadata_completa(
    client, auth_headers, workspace: Workspace, cliente: Cliente,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos",
        json={
            "cliente_id": str(cliente.id),
            "nombre": "Con metadata",
            "estado": "pausado",
            "descripcion": "Proyecto en pausa por presupuesto",
            "fecha_inicio": "2026-01-01",
            "fecha_fin_estimada": "2026-12-31",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["estado"] == "pausado"
    assert body["descripcion"] == "Proyecto en pausa por presupuesto"
    assert body["fecha_inicio"] == "2026-01-01"
    assert body["fecha_fin_estimada"] == "2026-12-31"


@pytest.mark.asyncio
async def test_update_proyecto_cambia_estado(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto,
):
    resp = await client.put(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}",
        json={"estado": "archivado"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["estado"] == "archivado"
