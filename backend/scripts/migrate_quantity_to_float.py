"""
Migration: Change ingredients.quantity from INTEGER to DOUBLE PRECISION (float).

Usage:
    cd backend && source .venv/Scripts/activate
    python scripts/migrate_quantity_to_float.py

Existing integer values are automatically converted (1 → 1.0, no data loss).
"""

import asyncio

from sqlalchemy import text

from app.database.session import async_engine


async def migrate():
    async with async_engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE ingredients ALTER COLUMN quantity TYPE DOUBLE PRECISION;")
        )
    print("Done: ingredients.quantity → DOUBLE PRECISION")


if __name__ == "__main__":
    asyncio.run(migrate())
