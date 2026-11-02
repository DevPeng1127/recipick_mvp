import ssl


def database_connect_args(use_ssl: bool) -> dict:
    # Share certificate + hostname verification between runtime and migrations.
    # Keep URL free of libpq-only sslmode/channel_binding parameters: asyncpg's
    # SQLAlchemy adapter accepts an SSLContext through connect_args instead.
    return {"ssl": ssl.create_default_context()} if use_ssl else {}
