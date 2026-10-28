"""Persist cooking plans and atomic consumption receipts.

Revision ID: d2c730a19e84
Revises: c901e58a3f62
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d2c730a19e84"
down_revision = "c901e58a3f62"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cooking_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("recipe", sa.Text(), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column("refrigerator_ids", postgresql.JSONB(), nullable=False),
        sa.Column("requirements", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True)),
        sa.Column("request_hash", sa.String(64)),
        sa.Column("result", postgresql.JSONB()),
    )
    op.create_index("ix_cooking_plans_user_id", "cooking_plans", ["user_id"])


def downgrade():
    op.drop_index("ix_cooking_plans_user_id", table_name="cooking_plans")
    op.drop_table("cooking_plans")
