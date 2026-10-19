import os
import secrets

# Set a fresh test-only key before tests/conftest.py imports the application.
# Tests must not depend on a developer's or production signing key.
os.environ["JWT_SECRET_KEY"] = secrets.token_urlsafe(32)
