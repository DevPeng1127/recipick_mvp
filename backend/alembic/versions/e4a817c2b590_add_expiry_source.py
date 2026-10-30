"""Preserve the distinction between label dates and estimated use dates.

Revision ID: e4a817c2b590
Revises: d2c730a19e84
"""
from alembic import op
import sqlalchemy as sa

revision = "e4a817c2b590"
down_revision = "d2c730a19e84"
branch_labels = None
depends_on = None


def upgrade():
    # Existing dates have no reliable provenance; never relabel or recalculate them.
    for table in ("ingredients", "ingredient_logs"):
        op.add_column(table, sa.Column("expiry_source", sa.String(16), nullable=False, server_default="unknown"))


def downgrade():
    for table in ("ingredient_logs", "ingredients"):
        op.drop_column(table, "expiry_source")
