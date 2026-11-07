from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user, require_refrigerator_member, require_refrigerator_owner
from app.models.refrigerator import RefrigeratorMember
from app.models.user import User
from app.schemas.refrigerator import RefrigeratorMemberResponse
from app.schemas.sharing import InvitationAccepted, InvitationCreated, InvitationPreview, InvitationResponse, InvitationToken
from app.services import sharing_service as service

router = APIRouter(tags=["sharing"])
prefix = "/refrigerators/{refrigerator_id}"


@router.get(prefix + "/members", response_model=list[RefrigeratorMemberResponse])
async def members(refrigerator_id: int, member: RefrigeratorMember = Depends(require_refrigerator_member),
                  db: AsyncSession = Depends(get_db)):
    return await service.list_members(refrigerator_id, db)


@router.post(prefix + "/invitations", response_model=InvitationCreated, status_code=201)
async def create(refrigerator_id: int, owner: RefrigeratorMember = Depends(require_refrigerator_owner),
                 db: AsyncSession = Depends(get_db)):
    invitation = await service.create_invitation(refrigerator_id, db)
    await db.commit()
    return invitation


@router.get(prefix + "/invitations", response_model=list[InvitationResponse])
async def invitations(refrigerator_id: int, owner: RefrigeratorMember = Depends(require_refrigerator_owner),
                      db: AsyncSession = Depends(get_db)):
    return await service.list_invitations(refrigerator_id, db)


@router.delete(prefix + "/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke(refrigerator_id: int, invitation_id: int,
                 owner: RefrigeratorMember = Depends(require_refrigerator_owner), db: AsyncSession = Depends(get_db)):
    await service.revoke_invitation(refrigerator_id, invitation_id, db)
    await db.commit()


@router.post("/invitations/preview", response_model=InvitationPreview)
async def preview(data: InvitationToken, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.inspect_invitation(data.token, user.id, db)


@router.post("/invitations/accept", response_model=InvitationAccepted)
async def accept(data: InvitationToken, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    invitation = await service.inspect_invitation(data.token, user.id, db, accept=True)
    await db.commit()
    return invitation


@router.delete(prefix + "/members/me", status_code=status.HTTP_204_NO_CONTENT)
async def leave(refrigerator_id: int, member: RefrigeratorMember = Depends(require_refrigerator_member),
                db: AsyncSession = Depends(get_db)):
    await service.remove_member(refrigerator_id, member.user_id, db)
    await db.commit()


@router.delete(prefix + "/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(refrigerator_id: int, user_id: int,
                 owner: RefrigeratorMember = Depends(require_refrigerator_owner), db: AsyncSession = Depends(get_db)):
    await service.remove_member(refrigerator_id, user_id, db)
    await db.commit()
