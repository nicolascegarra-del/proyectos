import pytest
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlmodel import select

from app.models import Gasto, Presupuesto, PresupuestoLinea, Proyecto, Tarea, Cliente


@pytest.mark.asyncio
async def test_presupuesto_total_calculado_correctamente(
    client,
    auth_headers,
    session: AsyncSession,
    workspace,
    cliente: Cliente,
):
    presupuesto = Presupuesto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        numero="PRE-2024-0001",
        fecha=date.today(),
        total=0.0,
    )
    session.add(presupuesto)
    await session.commit()
    await session.refresh(presupuesto)

    response = await client.post(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}/lineas",
        json={"concepto": "Desarrollo", "cantidad": 10, "precio_unitario": 50.0},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["subtotal"] == 500.0

    response2 = await client.post(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}/lineas",
        json={"concepto": "Diseño", "cantidad": 5, "precio_unitario": 60.0},
        headers=auth_headers,
    )
    assert response2.status_code == 201
    assert response2.json()["subtotal"] == 300.0

    session.expunge(presupuesto)
    result = await session.exec(
        select(Presupuesto).where(Presupuesto.id == presupuesto.id)
    )
    p = result.first()
    assert p.total == 800.0


@pytest.mark.asyncio
async def test_margen_neto(
    session: AsyncSession,
    proyecto: Proyecto,
    kanban_estado,
):
    tarea1 = Tarea(proyecto_id=proyecto.id, descripcion="T1", horas=5.0, fecha=date.today(), estado_kanban=kanban_estado.id)
    tarea2 = Tarea(proyecto_id=proyecto.id, descripcion="T2", horas=3.0, fecha=date.today(), estado_kanban=kanban_estado.id)
    gasto1 = Gasto(proyecto_id=proyecto.id, concepto="G1", monto=100.0, fecha=date.today())
    gasto2 = Gasto(proyecto_id=proyecto.id, concepto="G2", monto=50.0, fecha=date.today())

    session.add_all([tarea1, tarea2, gasto1, gasto2])
    await session.commit()

    horas_result = await session.exec(
        select(func.sum(Tarea.horas)).where(Tarea.proyecto_id == proyecto.id)
    )
    total_horas = horas_result.one() or 0.0
    assert total_horas == 8.0

    ingresos = total_horas * proyecto.tarifa_hora
    assert ingresos == 400.0

    gastos_result = await session.exec(
        select(func.sum(Gasto.monto)).where(Gasto.proyecto_id == proyecto.id)
    )
    total_gastos = gastos_result.one() or 0.0
    assert total_gastos == 150.0

    margen = ingresos - total_gastos
    assert margen == 250.0


@pytest.mark.asyncio
async def test_subtotal_linea_presupuesto(
    client,
    auth_headers,
    session: AsyncSession,
    workspace,
    cliente: Cliente,
):
    presupuesto = Presupuesto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        numero="PRE-2024-0002",
        fecha=date.today(),
    )
    session.add(presupuesto)
    await session.commit()
    await session.refresh(presupuesto)

    response = await client.post(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}/lineas",
        json={"concepto": "Item", "cantidad": 3.5, "precio_unitario": 40.0},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["subtotal"] == pytest.approx(140.0)
    assert data["cantidad"] == 3.5
    assert data["precio_unitario"] == 40.0


@pytest.mark.asyncio
async def test_total_actualizado_al_eliminar_linea(
    client,
    auth_headers,
    session: AsyncSession,
    workspace,
    cliente: Cliente,
):
    presupuesto = Presupuesto(
        workspace_id=workspace.id,
        cliente_id=cliente.id,
        numero="PRE-2024-0003",
        fecha=date.today(),
    )
    session.add(presupuesto)
    await session.commit()
    await session.refresh(presupuesto)

    r1 = await client.post(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}/lineas",
        json={"concepto": "A", "cantidad": 1, "precio_unitario": 200.0},
        headers=auth_headers,
    )
    r2 = await client.post(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}/lineas",
        json={"concepto": "B", "cantidad": 1, "precio_unitario": 100.0},
        headers=auth_headers,
    )

    linea_id = r1.json()["id"]
    await client.delete(
        f"/workspaces/{workspace.id}/presupuestos/{presupuesto.id}/lineas/{linea_id}",
        headers=auth_headers,
    )

    result = await session.exec(
        select(Presupuesto).where(Presupuesto.id == presupuesto.id)
    )
    await session.refresh(result.first())
    p = (await session.exec(select(Presupuesto).where(Presupuesto.id == presupuesto.id))).first()
    assert p.total == 100.0
