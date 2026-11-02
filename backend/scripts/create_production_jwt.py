"""Create a separate, ignored production signing key without printing it."""
import os
from pathlib import Path
import secrets


def main() -> None:
    destination = Path(__file__).resolve().parents[2] / ".deploy" / "secrets" / "jwt-secret.txt"
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise SystemExit("Production key file already exists; refusing to overwrite or rotate it.") from None
    with os.fdopen(descriptor, "w", encoding="ascii") as output:
        output.write(secrets.token_urlsafe(64))
    print("Created a new production signing key at .deploy/secrets/jwt-secret.txt (value hidden).")
    print("Upload this file to Google Secret Manager; never paste the value in chat or commit it.")


if __name__ == "__main__":
    main()
