"""Persist recipe request quotas and in-flight leases.

Revision ID: b84e1f920a63
Revises: 1338c8f9fe82
"""
from alembic import op
import sqlalchemy as sa

revision = "b84e1f920a63"
down_revision = "1338c8f9fe82"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recipe_usage_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_recipe_usage_attempts_started_at", "recipe_usage_attempts", ["started_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_recipe_usage_attempts_started_at", table_name="recipe_usage_attempts")
    op.drop_table("recipe_usage_attempts")
