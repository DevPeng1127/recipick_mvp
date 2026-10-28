"""Add single-use refrigerator invitations.

Revision ID: c901e58a3f62
Revises: b84e1f920a63
"""
from alembic import op
import sqlalchemy as sa

revision = "c901e58a3f62"
down_revision = "b84e1f920a63"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "refrigerator_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("refrigerator_id", sa.Integer(), sa.ForeignKey("refrigerators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_index("ix_refrigerator_invitations_refrigerator_id", "refrigerator_invitations", ["refrigerator_id"])


def downgrade():
    op.drop_index("ix_refrigerator_invitations_refrigerator_id", table_name="refrigerator_invitations")
    op.drop_table("refrigerator_invitations")
