import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.invitation import RefrigeratorInvitation
from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.schemas.refrigerator import RefrigeratorMemberResponse
from app.schemas.sharing import InvitationResponse


def invitation_response(invite: RefrigeratorInvitation) -> InvitationResponse:
    status = (
        "revoked" if invite.revoked_at else "used" if invite.accepted_at
        else "expired" if invite.expires_at <= datetime.now(timezone.utc) else "active"
    )
    return InvitationResponse(id=invite.id, created_at=invite.created_at,
                              expires_at=invite.expires_at, status=status)


async def list_members(refrigerator_id: int, db: AsyncSession):
    members = (await db.scalars(
        select(RefrigeratorMember).where(RefrigeratorMember.refrigerator_id == refrigerator_id)
        .options(selectinload(RefrigeratorMember.user)).order_by(RefrigeratorMember.id)
    )).all()
    return [RefrigeratorMemberResponse(id=m.id, user_id=m.user_id, role=m.role,
                                       nickname=m.user.nickname) for m in members]


async def create_invitation(refrigerator_id: int, db: AsyncSession):
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    invite = RefrigeratorInvitation(
        refrigerator_id=refrigerator_id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        created_at=now,
        expires_at=now + timedelta(hours=24),
    )
    db.add(invite)
    await db.flush()
    # Fragments are not sent in HTTP requests or Referer headers.
    return {**invitation_response(invite).model_dump(),
            "url": f"{settings.FRONTEND_URL.rstrip('/')}/invite#{token}"}


async def list_invitations(refrigerator_id: int, db: AsyncSession):
    invites = (await db.scalars(select(RefrigeratorInvitation).where(
        RefrigeratorInvitation.refrigerator_id == refrigerator_id
    ).order_by(RefrigeratorInvitation.id.desc()))).all()
    return [invitation_response(i) for i in invites]


async def lock_refrigerator(refrigerator_id: int, db: AsyncSession):
    fridge = await db.scalar(select(Refrigerator).where(
        Refrigerator.id == refrigerator_id
    ).with_for_update())
    if fridge is None:
        raise HTTPException(404, "냉장고를 찾을 수 없습니다.")
    return fridge


async def revoke_invitation(refrigerator_id: int, invitation_id: int, db: AsyncSession):
    await lock_refrigerator(refrigerator_id, db)
    invite = await db.scalar(select(RefrigeratorInvitation).where(
        RefrigeratorInvitation.id == invitation_id,
        RefrigeratorInvitation.refrigerator_id == refrigerator_id,
    ).with_for_update())
    if invite is None:
        raise HTTPException(404, "초대를 찾을 수 없습니다.")
    if invite.accepted_at:
        raise HTTPException(409, "이미 수락한 초대입니다. 회원 목록에서 내보내기를 사용해 주세요.")
    invite.revoked_at = invite.revoked_at or datetime.now(timezone.utc)
    await db.flush()


async def inspect_invitation(token: str, user_id: int, db: AsyncSession, *, accept=False):
    digest = hashlib.sha256(token.encode()).hexdigest()
    refrigerator_id = await db.scalar(select(RefrigeratorInvitation.refrigerator_id).where(
        RefrigeratorInvitation.token_hash == digest
    ))
    unavailable = HTTPException(410, "사용할 수 없는 초대입니다. 새 초대 링크를 요청해 주세요.")
    if refrigerator_id is None:
        raise unavailable
    # Serialize all joins/removals per refrigerator, including joins via different links.
    fridge = await lock_refrigerator(refrigerator_id, db)
    invite = await db.scalar(select(RefrigeratorInvitation).where(
        RefrigeratorInvitation.token_hash == digest
    ).with_for_update())
    member = await db.scalar(select(RefrigeratorMember).where(
        RefrigeratorMember.refrigerator_id == refrigerator_id,
        RefrigeratorMember.user_id == user_id,
    ))
    if invite is None or invite.revoked_at:
        raise unavailable
    if invite.accepted_at:
        # A retry is safe only while the accepting user's membership still exists.
        if invite.accepted_by != user_id or member is None:
            raise unavailable
    elif invite.expires_at <= datetime.now(timezone.utc):
        raise unavailable
    already_member = member is not None
    if accept and not already_member:
        db.add(RefrigeratorMember(refrigerator_id=refrigerator_id, user_id=user_id,
                                  role=MemberRole.GUEST))
        invite.accepted_by = user_id
        invite.accepted_at = datetime.now(timezone.utc)
        await db.flush()
    return dict(refrigerator_id=refrigerator_id, refrigerator_name=fridge.name,
                expires_at=invite.expires_at, already_member=already_member)


async def remove_member(refrigerator_id: int, user_id: int, db: AsyncSession):
    await lock_refrigerator(refrigerator_id, db)
    member = await db.scalar(select(RefrigeratorMember).where(
        RefrigeratorMember.refrigerator_id == refrigerator_id,
        RefrigeratorMember.user_id == user_id,
    ))
    if member is None:
        raise HTTPException(404, "회원을 찾을 수 없습니다.")
    if member.role == MemberRole.OWNER:
        raise HTTPException(403, "소유자는 탈퇴하거나 내보낼 수 없습니다.")
    await db.delete(member)
    await db.flush()
