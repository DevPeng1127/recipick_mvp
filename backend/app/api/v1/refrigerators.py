from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user, require_refrigerator_member
from app.models.refrigerator import RefrigeratorMember
from app.models.user import User
from app.schemas.refrigerator import (
    RefrigeratorCreate,
    RefrigeratorDetailResponse,
    RefrigeratorListResponse,
    RefrigeratorResponse,
    RefrigeratorUpdate,
)
from app.services.refrigerator_service import (
    create_refrigerator,
    delete_refrigerator,
    get_refrigerator_detail,
    list_refrigerators,
    update_refrigerator,
)

router = APIRouter(prefix="/refrigerators", tags=["refrigerators"])


@router.get("", response_model=list[RefrigeratorListResponse])
async def list_my_refrigerators(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_refrigerators(current_user.id, db)


@router.post("", response_model=RefrigeratorResponse, status_code=status.HTTP_201_CREATED)
async def create_new_refrigerator(
    data: RefrigeratorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_refrigerator(current_user.id, data, db)


@router.get("/{refrigerator_id}", response_model=RefrigeratorDetailResponse)
async def get_refrigerator(
    refrigerator_id: int,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    db: AsyncSession = Depends(get_db),
):
    refrigerator = await get_refrigerator_detail(refrigerator_id, db)
    if refrigerator is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refrigerator not found")
    return refrigerator


@router.put("/{refrigerator_id}", response_model=RefrigeratorResponse)
async def update_refrigerator_endpoint(
    refrigerator_id: int,
    data: RefrigeratorUpdate,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    db: AsyncSession = Depends(get_db),
):
    refrigerator = await update_refrigerator(refrigerator_id, data, db)
    if refrigerator is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refrigerator not found")
    return refrigerator


@router.delete("/{refrigerator_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_refrigerator_endpoint(
    refrigerator_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_refrigerator(refrigerator_id, current_user.id, db)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete a refrigerator",
        )
