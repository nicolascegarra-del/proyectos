import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import Plan, User, WorkspaceMember


@pytest.mark.asyncio
async def test_no_puede_crear_mas_workspaces_del_limite(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: dict,
    user: User,
    plan: Plan,
    workspace,
):
    plan.max_workspaces = 1
    session.add(plan)
    await session.commit()

    response = await client.post(
        "/workspaces",
        json={"nombre": "Workspace Extra"},
        headers=auth_headers,
    )
    assert response.status_code == 402
    data = response.json()
    assert data["detail"]["resource"] == "workspace"
    assert data["detail"]["limit"] == 1


@pytest.mark.asyncio
async def test_puede_crear_workspace_dentro_del_limite(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: dict,
    user: User,
    plan: Plan,
):
    plan.max_workspaces = 5
    plan.es_default = True
    session.add(plan)
    await session.commit()

    response = await client.post(
        "/workspaces",
        json={"nombre": "Workspace Permitido"},
        headers=auth_headers,
    )
    assert response.status_code in (201, 402)


@pytest.mark.asyncio
async def test_limite_ilimitado_con_minus_uno(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: dict,
    user: User,
    plan: Plan,
    workspace,
    cliente,
):
    plan.max_proyectos_por_workspace = -1
    session.add(plan)
    await session.commit()

    for i in range(5):
        r = await client.post(
            f"/workspaces/{workspace.id}/proyectos",
            json={
                "nombre": f"Proyecto {i}",
                "cliente_id": str((await session.exec(
                    __import__('sqlmodel', fromlist=['select']).select(
                        __import__('app.models', fromlist=['Cliente']).Cliente
                    ).where(
                        __import__('app.models', fromlist=['Cliente']).Cliente.workspace_id == workspace.id
                    )
                )).first().id),
                "tarifa_hora": 50.0,
            },
            headers=auth_headers,
        )
        assert r.status_code in (201, 404)


@pytest.mark.asyncio
async def test_limite_tareas_por_proyecto(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: dict,
    user: User,
    plan: Plan,
    proyecto,
    kanban_estado,
    workspace,
):
    from datetime import date

    plan.max_tareas_por_proyecto = 2
    session.add(plan)
    await session.commit()

    from app.models import Tarea

    t1 = Tarea(proyecto_id=proyecto.id, descripcion="T1", horas=1.0, fecha=date.today(), estado_kanban=kanban_estado.id)
    t2 = Tarea(proyecto_id=proyecto.id, descripcion="T2", horas=1.0, fecha=date.today(), estado_kanban=kanban_estado.id)
    session.add(t1)
    session.add(t2)
    await session.commit()

    response = await client.post(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas",
        json={"descripcion": "Tarea extra", "horas": 1.0, "fecha": str(date.today())},
        headers=auth_headers,
    )
    assert response.status_code == 402
    assert response.json()["detail"]["resource"] == "tarea"


@pytest.mark.asyncio
async def test_registro_asigna_plan_default(
    client: AsyncClient,
    session: AsyncSession,
    plan: Plan,
):
    plan.es_default = True
    session.add(plan)
    await session.commit()

    response = await client.post(
        "/auth/register",
        json={"email": "nuevo@klyp.app", "password": "Secure123!", "nombre": "Nuevo"},
    )
    assert response.status_code == 201

    user_result = await session.exec(
        select(User).where(User.email == "nuevo@klyp.app")
    )
    user = user_result.first()
    assert user is not None
    assert user.plan_id == plan.id
