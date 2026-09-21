from __future__ import annotations

import base64
import hashlib
import hmac
import secrets


SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_LENGTH = 64


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived_key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_LENGTH,
    )
    encoded_salt = base64.b64encode(salt).decode("ascii")
    encoded_key = base64.b64encode(derived_key).decode("ascii")
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${encoded_salt}${encoded_key}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, n, r, p, encoded_salt, encoded_key = password_hash.split("$")
        if algorithm != "scrypt":
            return False
        salt = base64.b64decode(encoded_salt)
        expected_key = base64.b64decode(encoded_key)
        derived_key = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected_key),
        )
        return hmac.compare_digest(derived_key, expected_key)
    except (ValueError, TypeError):
        return False


def create_access_token() -> str:
    return secrets.token_urlsafe(48)


def create_password_reset_token() -> str:
    """Cryptographically secure, URL-safe token for password-reset links.

    Only the SHA-256 hash (see :func:`hash_access_token`) is stored, so a
    leaked database row cannot be turned back into a usable reset link.
    """
    return secrets.token_urlsafe(48)


def hash_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
