"""Tests de la feature de etiquetas (multietiqueta, privadas por usuario) y
gestión de usuarios/workspaces por superadmin."""
import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import create_access_token, hash_password
from app.models import (
    Cliente,
    KanbanEstado,
    Plan,
    Proyecto,
    RolWorkspace,
    Tag,
    User,
    Workspace,
    WorkspaceMember,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_member(session: AsyncSession, workspace: Workspace, email: str) -> tuple[User, dict]:
    u = User(email=email, password_hash=hash_password("Testpass123!"), nombre=email.split("@")[0])
    session.add(u)
    await session.flush()
    session.add(WorkspaceMember(workspace_id=workspace.id, user_id=u.id, rol=RolWorkspace.member))
    await session.commit()
    await session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(str(u.id), u.email, False)}"}
    return u, headers


async def _make_superadmin(session: AsyncSession) -> tuple[User, dict]:
    u = User(
        email="super@klyp.app", password_hash=hash_password("Testpass123!"),
        nombre="Super", is_superadmin=True,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(str(u.id), u.email, True)}"}
    return u, headers


# ── Etiquetas: auto-seed y privacidad ────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_tags_auto_seed_defaults(
    client, auth_headers, workspace: Workspace,
):
    resp = await client.get(f"/workspaces/{workspace.id}/tags", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    nombres = sorted(t["nombre"] for t in resp.json())
    assert nombres == ["Bloqueo", "General", "Reunión"]


@pytest.mark.asyncio
async def test_tags_privadas_por_usuario(
    client, auth_headers, session: AsyncSession, workspace: Workspace,
):
    # El owner crea una etiqueta propia
    resp = await client.post(
        f"/workspaces/{workspace.id}/tags",
        json={"nombre": "Privada owner", "color": "#123456"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text

    # Otro miembro no la ve (a él se le siembran sus propias por defecto)
    _, other_headers = await _make_member(session, workspace, "otro@klyp.app")
    resp_other = await client.get(f"/workspaces/{workspace.id}/tags", headers=other_headers)
    assert resp_other.status_code == 200
    assert all(t["nombre"] != "Privada owner" for t in resp_other.json())


@pytest.mark.asyncio
async def test_no_puedo_editar_etiqueta_de_otro(
    client, auth_headers, session: AsyncSession, workspace: Workspace,
):
    _, other_headers = await _make_member(session, workspace, "otro2@klyp.app")
    # owner crea
    created = (await client.post(
        f"/workspaces/{workspace.id}/tags",
        json={"nombre": "Owner tag", "color": "#abcdef"},
        headers=auth_headers,
    )).json()
    # otro intenta editar → 404 (no es suya)
    resp = await client.put(
        f"/workspaces/{workspace.id}/tags/{created['id']}",
        json={"nombre": "hackeada"},
        headers=other_headers,
    )
    assert resp.status_code == 404


# ── Multietiqueta en tareas ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tarea_multietiqueta(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    user: User, kanban_estado: KanbanEstado,
):
    t1 = Tag(workspace_id=workspace.id, user_id=user.id, nombre="A", color="#111111")
    t2 = Tag(workspace_id=workspace.id, user_id=user.id, nombre="B", color="#222222")
    session.add_all([t1, t2])
    await session.commit()
    await session.refresh(t1)
    await session.refresh(t2)

    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas",
        json={
            "descripcion": "tarea con tags",
            "horas": 1,
            "fecha": str(date.today()),
            "tag_ids": [str(t1.id), str(t2.id)],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    nombres = sorted(t["nombre"] for t in resp.json()["tags"])
    assert nombres == ["A", "B"]


@pytest.mark.asyncio
async def test_tarea_tag_ajeno_da_400(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    kanban_estado: KanbanEstado,
):
    other, _ = await _make_member(session, workspace, "ajeno@klyp.app")
    tag_ajeno = Tag(workspace_id=workspace.id, user_id=other.id, nombre="Ajeno", color="#333333")
    session.add(tag_ajeno)
    await session.commit()
    await session.refresh(tag_ajeno)

    resp = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas",
        json={
            "descripcion": "tarea", "horas": 1, "fecha": str(date.today()),
            "tag_ids": [str(tag_ajeno.id)],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_tarea_reemplaza_tags(
    client, auth_headers, session: AsyncSession, workspace: Workspace, proyecto: Proyecto,
    user: User, kanban_estado: KanbanEstado,
):
    t1 = Tag(workspace_id=workspace.id, user_id=user.id, nombre="X", color="#111111")
    t2 = Tag(workspace_id=workspace.id, user_id=user.id, nombre="Y", color="#222222")
    session.add_all([t1, t2])
    await session.commit()
    await session.refresh(t1)
    await session.refresh(t2)

    created = (await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas",
        json={"descripcion": "t", "horas": 1, "fecha": str(date.today()), "tag_ids": [str(t1.id)]},
        headers=auth_headers,
    )).json()

    resp = await client.put(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{created['id']}",
        json={"tag_ids": [str(t2.id)]},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    tags = resp.json()["tags"]
    assert len(tags) == 1 and tags[0]["nombre"] == "Y"


# ── Superadmin: crear usuarios/workspaces y asignar ──────────────────────────


@pytest.mark.asyncio
async def test_superadmin_crea_usuario(client, session: AsyncSession, plan: Plan):
    _, sa_headers = await _make_superadmin(session)
    resp = await client.post(
        "/superadmin/users",
        json={"email": "nuevo@klyp.app", "nombre": "Nuevo"},
        headers=sa_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user"]["email"] == "nuevo@klyp.app"
    assert len(body["temp_password"]) >= 8


@pytest.mark.asyncio
async def test_superadmin_crea_workspace_y_asigna(
    client, session: AsyncSession, user: User,
):
    _, sa_headers = await _make_superadmin(session)
    # Crear workspace con owner = user existente
    ws_resp = await client.post(
        "/superadmin/workspaces",
        json={"nombre": "WS Admin", "owner_id": str(user.id)},
        headers=sa_headers,
    )
    assert ws_resp.status_code == 201, ws_resp.text
    ws_id = ws_resp.json()["id"]

    # Crear un segundo usuario y asignarle el workspace
    other = User(email="asignado@klyp.app", password_hash=hash_password("Testpass123!"), nombre="Asig")
    session.add(other)
    await session.commit()
    await session.refresh(other)

    assign = await client.post(
        f"/superadmin/users/{other.id}/workspaces",
        json={"workspace_id": ws_id, "rol": "member"},
        headers=sa_headers,
    )
    assert assign.status_code == 201, assign.text

    # El usuario aparece en el workspace
    ws_list = await client.get(f"/superadmin/users/{other.id}/workspaces", headers=sa_headers)
    assert ws_list.status_code == 200
    assert any(str(w["workspace_id"]) == ws_id for w in ws_list.json())

    # Desasignar
    unassign = await client.delete(
        f"/superadmin/users/{other.id}/workspaces/{ws_id}", headers=sa_headers,
    )
    assert unassign.status_code == 204


@pytest.mark.asyncio
async def test_superadmin_no_quita_owner(client, session: AsyncSession, user: User):
    _, sa_headers = await _make_superadmin(session)
    ws_resp = await client.post(
        "/superadmin/workspaces",
        json={"nombre": "WS Owner", "owner_id": str(user.id)},
        headers=sa_headers,
    )
    ws_id = ws_resp.json()["id"]
    resp = await client.delete(
        f"/superadmin/users/{user.id}/workspaces/{ws_id}", headers=sa_headers,
    )
    assert resp.status_code == 400
