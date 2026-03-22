import pytest
from datetime import date
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Presupuesto, PresupuestoLinea, Proyecto, Tarea, Cliente


@pytest.mark.asyncio
async def test_tarea_locked_no_editable(
    client: AsyncClient,
    auth_headers: dict,
    session: AsyncSession,
    proyecto: Proyecto,
    workspace,
):
    tarea = Tarea(
        proyecto_id=proyecto.id,
        descripcion="Tarea bloqueada",
        horas=2.0,
        fecha=date.today(),
        is_locked=True,
    )
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    response = await client.put(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{tarea.id}",
        json={"descripcion": "intento editar"},
        headers=auth_headers,
    )
    assert response.status_code == 409
    assert "bloqueada" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tarea_locked_no_eliminable(
    client: AsyncClient,
    auth_headers: dict,
    session: AsyncSession,
    proyecto: Proyecto,
    workspace,
):
    tarea = Tarea(
        proyecto_id=proyecto.id,
        descripcion="Tarea bloqueada",
        horas=1.0,
        fecha=date.today(),
        is_locked=True,
    )
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    response = await client.delete(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{tarea.id}",
        headers=auth_headers,
    )
    assert response.status_code == 409
    assert "bloqueada" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tarea_unlocked_editable(
    client: AsyncClient,
    auth_headers: dict,
    session: AsyncSession,
    proyecto: Proyecto,
    workspace,
):
    tarea = Tarea(
        proyecto_id=proyecto.id,
        descripcion="Tarea sin bloquear",
        horas=1.0,
        fecha=date.today(),
        is_locked=False,
    )
    session.add(tarea)
    await session.commit()
    await session.refresh(tarea)

    response = await client.put(
        f"/workspaces/{workspace.id}/proyectos/{proyecto.id}/tareas/{tarea.id}",
        json={"descripcion": "editada correctamente"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["descripcion"] == "editada correctamente"


@pytest.mark.asyncio
async def test_presupuesto_locked_no_editable(
    client: AsyncClient,
    auth_headers: dict,
    session: AsyncSession,
    workspace,
    cliente: Cliente,
):
    presupuesto = Presupuesto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        numero="PRE-2024-0001",
        fecha=date.today(),
        is_locked=True,
    )
    session.add(presupuesto)
    await session.commit()
    await session.refresh(presupuesto)

    response = await client.put(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}",
        json={"estado": "enviado"},
        headers=auth_headers,
    )
    assert response.status_code == 409
    assert "bloqueado" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_presupuesto_locked_linea_no_editable(
    client: AsyncClient,
    auth_headers: dict,
    session: AsyncSession,
    workspace,
    cliente: Cliente,
):
    presupuesto = Presupuesto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        numero="PRE-2024-0002",
        fecha=date.today(),
        is_locked=True,
    )
    session.add(presupuesto)
    await session.commit()
    await session.refresh(presupuesto)

    linea = PresupuestoLinea(
        presupuesto_id=presupuesto.id,
        concepto="Línea test",
        cantidad=1.0,
        precio_unitario=100.0,
        subtotal=100.0,
    )
    session.add(linea)
    await session.commit()
    await session.refresh(linea)

    response = await client.put(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}/lineas/{linea.id}",
        json={"concepto": "modificada"},
        headers=auth_headers,
    )
    assert response.status_code == 409
    assert "bloqueado" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_presupuesto_locked_eliminacion(
    client: AsyncClient,
    auth_headers: dict,
    session: AsyncSession,
    workspace,
    cliente: Cliente,
):
    presupuesto = Presupuesto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        numero="PRE-2024-0003",
        fecha=date.today(),
        is_locked=True,
    )
    session.add(presupuesto)
    await session.commit()
    await session.refresh(presupuesto)

    response = await client.delete(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}",
        headers=auth_headers,
    )
    assert response.status_code == 409
