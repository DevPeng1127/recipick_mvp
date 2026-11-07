import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.ai.prompts import today_kst

from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from app.models.ingredient_log import ActionType, IngredientLog
from app.models.refrigerator import Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox
from app.schemas.recipe import CookingCommit, CookingPreview, CookingStock, CookingSuggestion, GeneratedRecipe
from app.services.inventory_locks import lock_storage_boxes


async def authorize(refrigerator_ids: list[int], user_id: int, db: AsyncSession, *, lock=False):
    ids = sorted(set(refrigerator_ids))
    if lock:
        # Sharing removal locks the same refrigerator row exclusively.
        await db.execute(select(Refrigerator.id).where(Refrigerator.id.in_(ids))
                         .order_by(Refrigerator.id).with_for_update(read=True))
    allowed = (await db.execute(select(RefrigeratorMember.refrigerator_id).where(
        RefrigeratorMember.user_id == user_id, RefrigeratorMember.refrigerator_id.in_(ids)
    ))).scalars().all()
    if set(allowed) != set(ids):
        raise HTTPException(403, "선택한 냉장고에 접근할 수 없습니다.")


async def create_plan(result: GeneratedRecipe, ids: list[int], user_id: int, servings: int, db: AsyncSession):
    plan = CookingPlan(user_id=user_id, title=result.title, recipe=result.recipe, servings=servings,
                       refrigerator_ids=sorted(set(ids)),
                       requirements=[item.model_dump() for item in result.requirements])
    db.add(plan)
    await db.flush()
    return plan


async def get_plan(plan_id: UUID, user_id: int, db: AsyncSession, *, lock=False):
    query = select(CookingPlan).where(CookingPlan.id == plan_id, CookingPlan.user_id == user_id)
    if lock:
        query = query.with_for_update()
    plan = await db.scalar(query)
    if plan is None:
        raise HTTPException(404, "요리 기록을 찾을 수 없습니다.")
    await authorize(plan.refrigerator_ids, user_id, db, lock=lock)
    return plan


def stock_token(ingredient: Ingredient, box: StorageBox, fridge: Refrigerator):
    # Compare all meaningful visible values under a row lock, not just quantity.
    state = [ingredient.id, ingredient.name, ingredient.quantity, ingredient.unit,
             str(ingredient.expiry_date), ingredient.expiry_source, box.id, box.name, fridge.id, fridge.name]
    return hashlib.sha256(json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


async def stock_rows(ids: list[int], db: AsyncSession, *, item_ids=None, lock=False):
    query = (select(Ingredient, StorageBox, Refrigerator)
             .join(StorageBox, Ingredient.storage_box_id == StorageBox.id)
             .join(Refrigerator, StorageBox.refrigerator_id == Refrigerator.id)
             .where(Refrigerator.id.in_(ids)).order_by(Ingredient.id))
    if item_ids is not None:
        query = query.where(Ingredient.id.in_(item_ids))
    if lock:
        boxes = await lock_storage_boxes(ids, db, ingredient_ids=item_ids, read=True)
        # Re-read under locks and exclude any item moved to an unlocked box
        # between discovering its parent and locking it. commit rejects it.
        query = query.where(StorageBox.id.in_([box.id for box in boxes]))
        query = query.with_for_update(of=Ingredient)
    return (await db.execute(query.execution_options(populate_existing=True))).all()


def conversion(source: str | None, target: str):
    if not source or source.strip() in {"약간", "적당량", "조금", "한 줌", "줌"}:
        return None
    if source.strip() == target.strip():
        return Decimal(1)
    units = {"g": ("mass", Decimal(1)), "kg": ("mass", Decimal(1000)),
             "ml": ("volume", Decimal(1)), "L": ("volume", Decimal(1000))}
    a, b = units.get(source.strip()), units.get(target.strip())
    return a[1] / b[1] if a and b and a[0] == b[0] else None


def suggestions(requirements: list[dict], stock: list[CookingStock]):
    results = []
    available = {item.ingredient_id: Decimal(str(item.quantity)) for item in stock}
    for index, need in enumerate(requirements):
        matches = [s for s in stock if s.name.strip().casefold() == need["ingredient_name"].strip().casefold()
                   and (s.expiry_date is None or s.expiry_date >= today_kst())]
        compatible = [s for s in matches if conversion(need["unit"], s.unit) is not None]
        if need["quantity"] is None or not compatible:
            results.append(CookingSuggestion(requirement_index=index,
                ingredient_id=matches[0].ingredient_id if matches else None, quantity=None,
                message="수량·단위를 확인해 직접 입력해 주세요." if matches else "연결할 재고를 선택하거나 차감에서 제외해 주세요."))
            continue
        remaining = Decimal(str(need["quantity"]))
        allocated = []
        for item in compatible:
            factor = conversion(need["unit"], item.unit)
            take = min(max(available[item.ingredient_id], Decimal(0)), remaining * factor)
            if take <= 0:
                continue
            amount = take.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            # Never silently discard an unrepresentable small usage quantity.
            if amount <= 0:
                break
            allocated.append(CookingSuggestion(requirement_index=index, ingredient_id=item.ingredient_id, quantity=float(amount)))
            available[item.ingredient_id] -= amount
            remaining = max(Decimal(0), remaining - amount / factor)
            if remaining == 0:
                break
        if remaining > 0:
            results.append(CookingSuggestion(requirement_index=index, ingredient_id=None, quantity=None,
                message="필요량을 모두 연결하지 못했습니다. 재고 부족 또는 단위를 확인하고, 실제 사용할 양을 직접 입력하거나 제외해 주세요."))
        results.extend(allocated)
    return results


async def preview(plan_id: UUID, user_id: int, db: AsyncSession):
    plan = await get_plan(plan_id, user_id, db)
    stock = [CookingStock(ingredient_id=i.id, name=i.name, quantity=i.quantity, unit=i.unit,
              expiry_date=i.expiry_date, expiry_source=i.expiry_source, refrigerator_id=f.id, refrigerator_name=f.name,
              storage_box_name=b.name, token=stock_token(i, b, f))
             for i, b, f in await stock_rows(plan.refrigerator_ids, db)]
    stock.sort(key=lambda s: (s.expiry_date is None, str(s.expiry_date or ""), s.ingredient_id))
    return CookingPreview(plan_id=plan.id, title=plan.title, recipe=plan.recipe, servings=plan.servings,
                          requirements=plan.requirements, stock=stock,
                          suggestions=suggestions(plan.requirements, stock) if not plan.applied_at else [],
                          applied_at=plan.applied_at, result=plan.result)


def conflict(code: str, message: str):
    return HTTPException(409, {"code": code, "message": message})


async def commit(plan_id: UUID, user_id: int, data: CookingCommit, db: AsyncSession):
    plan = await get_plan(plan_id, user_id, db, lock=True)
    canonical = sorted((item.model_dump() for item in data.items), key=lambda item: item["ingredient_id"])
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
    if plan.applied_at:
        if plan.request_hash == digest:
            return plan.result
        raise conflict("already_applied", "이 요리의 차감은 이미 완료됐습니다.")
    rows = await stock_rows(plan.refrigerator_ids, db, item_ids=[i.ingredient_id for i in data.items], lock=True)
    by_id = {i.id: (i, b, f) for i, b, f in rows}
    for item in data.items:
        row = by_id.get(item.ingredient_id)
        if row is None or stock_token(*row) != item.expected_token or Decimal(str(item.quantity)) > Decimal(str(row[0].quantity)):
            raise conflict("inventory_changed", "재고가 변경되었거나 부족합니다. 아무것도 차감하지 않았습니다. 최신 재고를 확인해 주세요.")
    consumed = []
    for item in data.items:
        ingredient, box, fridge = by_id[item.ingredient_id]
        remaining = Decimal(str(ingredient.quantity)) - Decimal(str(item.quantity))
        db.add(IngredientLog(user_id=user_id, refrigerator_id=fridge.id, refrigerator_name=fridge.name,
            ingredient_id=ingredient.id, ingredient_name=ingredient.name, quantity=item.quantity,
            unit=ingredient.unit, expiry_date=ingredient.expiry_date, expiry_source=ingredient.expiry_source, action_type=ActionType.CONSUMED,
            memo=f"요리: {plan.title} ({plan.servings}인분) · {plan.id}"))
        consumed.append(dict(ingredient_id=ingredient.id, name=ingredient.name, quantity=item.quantity,
                             unit=ingredient.unit, remaining_quantity=float(remaining)))
        if remaining == 0:
            await db.delete(ingredient)
        else:
            ingredient.quantity = float(remaining)
    plan.applied_at = datetime.now(timezone.utc)
    plan.request_hash = digest
    plan.result = {"plan_id": str(plan.id), "title": plan.title, "items": consumed}
    await db.flush()
    # get_db commits the receipt, inventory and logs together or rolls all back.
    return plan.result


async def repeat(plan_id: UUID, user_id: int, db: AsyncSession):
    plan = await get_plan(plan_id, user_id, db, lock=True)
    if not plan.applied_at:
        raise conflict("not_applied", "진행 중인 요리의 사용 재료를 먼저 확인해 주세요.")
    # No AI request: a new cooking occasion uses the same reviewed recipe.
    return await create_plan(GeneratedRecipe(title=plan.title, recipe=plan.recipe, requirements=plan.requirements),
                             plan.refrigerator_ids, user_id, plan.servings, db)
