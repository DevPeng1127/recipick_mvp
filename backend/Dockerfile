FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt \
    && useradd --create-home --uid 10001 recipick

COPY --chown=recipick:recipick app ./app
COPY --chown=recipick:recipick alembic ./alembic
COPY --chown=recipick:recipick alembic.ini ./
USER recipick
EXPOSE 8080

# Run migrations as a separate Cloud Run Job, never on every autoscaled startup.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
