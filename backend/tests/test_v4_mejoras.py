"""Tests para las mejoras v4:
- Notas: edición (PATCH) por autor/admin, validación, y listado global con filtros/orden.
- Contactos: miembros de equipo sin cuenta (es_contacto), asignables a tareas,
  reutilizables en el workspace, y con login bloqueado.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import create_access_token, hash_password
from app.models import (
    Cliente,
    NotaProyecto,
    Proyecto,
    ProyectoMiembro,
    RolWorkspace,
    Tag,
    User,
    Workspace,
    WorkspaceMember,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_member(
    session: AsyncSession, workspace: Workspace, *, rol: RolWorkspace, nombre: str, email: str
) -> tuple[User, dict]:
    u = User(email=email, password_hash=hash_password("x"), nombre=nombre)
    session.add(u)
    await session.flush()
    session.add(WorkspaceMember(workspace_id=workspace.id, user_id=u.id, rol=rol))
    await session.commit()
    await session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(str(u.id), u.email, u.is_superadmin)}"}
    return u, headers


async def _make_nota(
    session: AsyncSession, proyecto: Proyecto, autor: User, *, texto: str, created_at: datetime
) -> NotaProyecto:
    n = NotaProyecto(
        proyecto_id=proyecto.id, user_id=autor.id, texto=texto,
        created_at=created_at, updated_at=created_at,
    )
    session.add(n)
    await session.commit()
    await session.refresh(n)
    return n


# ── Notas: edición (PATCH) ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_nota_autor_edita_texto(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto,
):
    create = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>original</p>"},
        headers=auth_headers,
    )
    nota_id = create.json()["id"]
    created_at = create.json()["created_at"]

    resp = await client.patch(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas/{nota_id}",
        json={"texto": "<p>editado</p>"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "<p>editado</p>" in body["texto"]
    assert body["updated_at"] >= created_at


@pytest.mark.asyncio
async def test_patch_nota_actualiza_etiquetas(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto, user: User,
):
    tag = Tag(workspace_id=workspace.id, user_id=user.id, nombre="Bloqueo", color="#EF4444")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)

    create = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>n</p>"},
        headers=auth_headers,
    )
    nota_id = create.json()["id"]

    resp = await client.patch(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas/{nota_id}",
        json={"tag_ids": [str(tag.id)]},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    tags = resp.json()["tags"]
    assert len(tags) == 1 and tags[0]["nombre"] == "Bloqueo"


@pytest.mark.asyncio
async def test_patch_nota_no_autor_sin_permiso_da_403(
    client, session: AsyncSession, workspace: Workspace, proyecto: Proyecto, user: User,
):
    # Nota creada por el owner; intenta editarla un 'member' que no es el autor.
    nota = await _make_nota(session, proyecto, user, texto="<p>de owner</p>", created_at=datetime.now())
    _, member_headers = await _make_member(
        session, workspace, rol=RolWorkspace.member, nombre="Miembro", email="miembro@klyp.app",
    )

    resp = await client.patch(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas/{nota.id}",
        json={"texto": "<p>intruso</p>"},
        headers=member_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_patch_nota_admin_edita_nota_de_otro(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto, user: User,
):
    # Nota de otro usuario; el owner (admin) sí puede editarla.
    otro, _ = await _make_member(
        session, workspace, rol=RolWorkspace.member, nombre="Otro", email="otro@klyp.app",
    )
    nota = await _make_nota(session, proyecto, otro, texto="<p>de otro</p>", created_at=datetime.now())

    resp = await client.patch(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas/{nota.id}",
        json={"texto": "<p>editado por admin</p>"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert "editado por admin" in resp.json()["texto"]


@pytest.mark.asyncio
async def test_patch_nota_texto_vacio_da_400(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto,
):
    create = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>algo</p>"},
        headers=auth_headers,
    )
    nota_id = create.json()["id"]

    resp = await client.patch(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas/{nota_id}",
        json={"texto": "<p></p>"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


# ── Notas: listado global ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_listado_global_incluye_proyecto_nombre(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto, user: User,
):
    await _make_nota(session, proyecto, user, texto="<p>a</p>", created_at=datetime.now())

    resp = await client.get(f"/workspaces/{workspace.id}/notas", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    arr = resp.json()
    assert len(arr) == 1
    assert arr[0]["proyecto_nombre"] == proyecto.nombre


@pytest.mark.asyncio
async def test_listado_global_filtra_por_proyecto(
    client, auth_headers, session: AsyncSession, workspace: Workspace, cliente: Cliente,
    proyecto: Proyecto, user: User,
):
    otro_proyecto = Proyecto(
        workspace_id=workspace.id, cliente_id=cliente.id, nombre="Proyecto B", tarifa_hora=10,
    )
    session.add(otro_proyecto)
    await session.commit()
    await session.refresh(otro_proyecto)

    await _make_nota(session, proyecto, user, texto="<p>en A</p>", created_at=datetime.now())
    await _make_nota(session, otro_proyecto, user, texto="<p>en B</p>", created_at=datetime.now())

    resp = await client.get(
        f"/workspaces/{workspace.id}/notas?proyecto_id={proyecto.id}", headers=auth_headers,
    )
    assert resp.status_code == 200
    arr = resp.json()
    assert len(arr) == 1
    assert arr[0]["proyecto_id"] == str(proyecto.id)


@pytest.mark.asyncio
async def test_listado_global_filtra_por_etiqueta(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto, user: User,
):
    tag = Tag(workspace_id=workspace.id, user_id=user.id, nombre="General", color="#6B7280")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)

    con_tag = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>etiquetada</p>", "tag_ids": [str(tag.id)]},
        headers=auth_headers,
    )
    assert con_tag.status_code == 201
    await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/notas",
        json={"texto": "<p>sin etiqueta</p>"},
        headers=auth_headers,
    )

    resp = await client.get(
        f"/workspaces/{workspace.id}/notas?tag_id={tag.id}", headers=auth_headers,
    )
    assert resp.status_code == 200
    arr = resp.json()
    assert len(arr) == 1
    assert arr[0]["id"] == con_tag.json()["id"]


@pytest.mark.asyncio
async def test_listado_global_respeta_orden(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto, user: User,
):
    base = datetime.now()
    vieja = await _make_nota(session, proyecto, user, texto="<p>vieja</p>", created_at=base - timedelta(days=2))
    nueva = await _make_nota(session, proyecto, user, texto="<p>nueva</p>", created_at=base)

    desc = await client.get(f"/workspaces/{workspace.id}/notas?orden=desc", headers=auth_headers)
    assert [n["id"] for n in desc.json()] == [str(nueva.id), str(vieja.id)]

    asc = await client.get(f"/workspaces/{workspace.id}/notas?orden=asc", headers=auth_headers)
    assert [n["id"] for n in asc.json()] == [str(vieja.id), str(nueva.id)]


# ── Contactos (miembros sin cuenta) ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_crear_contacto_sin_email_genera_placeholder(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/miembros/contacto",
        json={"nombre": "Sin Email", "horas_semana": 5},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user"]["es_contacto"] is True
    assert body["user"]["nombre"] == "Sin Email"
    assert body["horas_semana"] == 5

    contacto = (
        await session.exec(select(User).where(User.id == uuid.UUID(body["user_id"])))
    ).first()
    assert contacto.password_hash is None
    assert contacto.email.endswith("@no-login.local")


@pytest.mark.asyncio
async def test_crear_contacto_es_asignable_a_tarea(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto, kanban_estado,
):
    contacto = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/miembros/contacto",
        json={"nombre": "Asignable"},
        headers=auth_headers,
    )
    contacto_user_id = contacto.json()["user_id"]

    tarea = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas",
        json={
            "descripcion": "Tarea de contacto",
            "horas": 1,
            "fecha": str(date.today()),
            "assigned_to": contacto_user_id,
        },
        headers=auth_headers,
    )
    assert tarea.status_code == 201, tarea.text
    assert tarea.json()["assigned_to"] == contacto_user_id


@pytest.mark.asyncio
async def test_crear_contacto_email_duplicado_da_409(
    client, auth_headers, workspace: Workspace, proyecto: Proyecto, user: User,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/miembros/contacto",
        json={"nombre": "Choca", "email": user.email},
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_contacto_no_puede_hacer_login(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
):
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/miembros/contacto",
        json={"nombre": "Login Test", "email": "contacto.login@klyp.app"},
        headers=auth_headers,
    )
    assert resp.status_code == 201

    # Aunque le pongamos un hash manualmente, es_contacto debe bloquear el login.
    contacto = (
        await session.exec(select(User).where(User.email == "contacto.login@klyp.app"))
    ).first()
    contacto.password_hash = hash_password("intento123")
    session.add(contacto)
    await session.commit()

    login = await client.post(
        "/auth/login",
        json={"email": "contacto.login@klyp.app", "password": "intento123"},
    )
    assert login.status_code == 401


@pytest.mark.asyncio
async def test_contacto_reutilizable_en_segundo_proyecto(
    client, auth_headers, session: AsyncSession, workspace: Workspace, cliente: Cliente,
    proyecto: Proyecto,
):
    contacto = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/miembros/contacto",
        json={"nombre": "Reutilizable"},
        headers=auth_headers,
    )
    contacto_user_id = contacto.json()["user_id"]

    proyecto_b = Proyecto(
        workspace_id=workspace.id, cliente_id=cliente.id, nombre="Proyecto B", tarifa_hora=10,
    )
    session.add(proyecto_b)
    await session.commit()
    await session.refresh(proyecto_b)

    # Es WorkspaceMember, así que se puede añadir a otro proyecto con el endpoint normal.
    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto_b.id}/miembros",
        json={"user_id": contacto_user_id, "horas_semana": 2},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user"]["es_contacto"] is True
