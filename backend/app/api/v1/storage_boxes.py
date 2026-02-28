from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import require_refrigerator_member
from app.models.refrigerator import RefrigeratorMember
from app.schemas.storage import StorageBoxCreate, StorageBoxResponse, StorageBoxUpdate
from app.services.storage_service import (
    create_storage_box,
    delete_storage_box,
    list_storage_boxes,
    update_storage_box,
)

router = APIRouter(
    prefix="/refrigerators/{refrigerator_id}/storage-boxes",
    tags=["storage-boxes"],
)


@router.get("", response_model=list[StorageBoxResponse])
async def list_boxes(
    refrigerator_id: int,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    db: AsyncSession = Depends(get_db),
):
    return await list_storage_boxes(refrigerator_id, db)


@router.post("", response_model=StorageBoxResponse, status_code=status.HTTP_201_CREATED)
async def create_box(
    refrigerator_id: int,
    data: StorageBoxCreate,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    db: AsyncSession = Depends(get_db),
):
    return await create_storage_box(refrigerator_id, data, db)


@router.put("/{storage_box_id}", response_model=StorageBoxResponse)
async def update_box(
    refrigerator_id: int,
    storage_box_id: int,
    data: StorageBoxUpdate,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    db: AsyncSession = Depends(get_db),
):
    box = await update_storage_box(storage_box_id, refrigerator_id, data, db)
    if box is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage box not found")
    return box


@router.delete("/{storage_box_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_box(
    refrigerator_id: int,
    storage_box_id: int,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_storage_box(storage_box_id, refrigerator_id, db)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage box not found")
