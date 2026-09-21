"""Reusable SMTP email delivery for the Barangay Portal backend.

Single place where outgoing mail is sent, so no endpoint has to know how to
talk to the mail server:

* ``send_email`` — low-level transport (connect, STARTTLS/SSL, authenticate,
  send). Accepts plain text and/or HTML bodies.
* ``send_password_reset_email`` — the Forgot Password use case, built on top
  of ``send_email`` with the templates from ``app/email_templates.py``.

Configuration is read from the existing ``app.config.settings`` (i.e.
``backend/.env``); nothing here hardcodes credentials and the password is
never logged. Delivery failures raise :class:`EmailDeliveryError` so callers
can return a friendly, non-technical message to the client.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from .config import settings
from .email_templates import render_password_reset_email

logger = logging.getLogger(__name__)

#: SMTP port that expects an implicit TLS connection (Gmail and others).
SMTP_IMPLICIT_TLS_PORT = 465


class EmailDeliveryError(RuntimeError):
    """Raised when a message could not be handed to the SMTP server."""


def is_email_configured() -> bool:
    """True when the SMTP settings needed to send mail are all present."""
    return settings.smtp_configured


def mask_email(email: str) -> str:
    """``resident@example.com`` -> ``r***@example.com`` for safe logging."""
    local, _, domain = email.strip().partition("@")
    if not domain:
        return "***"
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


def _sender_header() -> str:
    """Build the ``From`` header from ``SMTP_FROM``/``SMTP_FROM_NAME``."""
    address = settings.smtp_from_address
    if "<" in address and ">" in address:
        # SMTP_FROM already contains a display name: use it verbatim.
        return address
    return formataddr((settings.smtp_from_name, address))


def _connect() -> smtplib.SMTP:
    """Open, secure and authenticate an SMTP connection.

    Port 465 uses implicit TLS; every other port uses STARTTLS when
    ``SMTP_USE_TLS`` is enabled. Raises :class:`EmailDeliveryError` when the
    server is unreachable or rejects the credentials -- the underlying
    ``smtplib``/``socket`` error is chained for server-side debugging.
    """
    if not settings.smtp_configured:
        raise EmailDeliveryError("SMTP settings are incomplete.")

    client: smtplib.SMTP | None = None
    try:
        if settings.smtp_port == SMTP_IMPLICIT_TLS_PORT:
            client = smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
            )
        else:
            client = smtplib.SMTP(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
            )
            if settings.smtp_use_tls:
                client.starttls()

        client.login(settings.smtp_username, settings.smtp_password)
    except (smtplib.SMTPException, OSError) as error:
        if client is not None:
            try:
                client.close()
            except (smtplib.SMTPException, OSError):
                pass
        # Log a short, credential-free description of the failure.
        # NOTE: smtplib exceptions subclass OSError, so check them first -
        # their message text can echo the server's reply (and the account).
        if isinstance(error, smtplib.SMTPException):
            detail = (
                f"{type(error).__name__} "
                f"(code {getattr(error, 'smtp_code', 'n/a')})"
            )
        else:
            detail = f"{type(error).__name__}: {error}"
        logger.error(
            "SMTP connection to %s:%s failed - %s.",
            settings.smtp_host,
            settings.smtp_port,
            detail,
        )
        raise EmailDeliveryError("Could not connect to the mail server.") from error

    return client


def build_message(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> EmailMessage:
    """Create a ``multipart/alternative`` message (text + optional HTML)."""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _sender_header()
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
    return message


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    """Send one email through the configured SMTP server.

    Blocks until the server accepts the message (the endpoint runs in
    FastAPI's threadpool). Raises :class:`EmailDeliveryError` on any
    connection, authentication or delivery problem.
    """
    if not settings.smtp_configured:
        logger.error("SMTP is not configured; message %r was not sent.", subject)
        raise EmailDeliveryError("SMTP is not configured.")

    message = build_message(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )

    try:
        client = _connect()
        try:
            client.send_message(message)
        finally:
            try:
                client.quit()
            except (smtplib.SMTPException, OSError):
                client.close()
    except EmailDeliveryError:
        raise
    except (smtplib.SMTPException, OSError) as error:
        logger.error(
            "SMTP delivery to %s failed - %s.",
            mask_email(to_email),
            type(error).__name__,
        )
        raise EmailDeliveryError("Could not send the email.") from error

    logger.info("Password/portal email sent to %s.", mask_email(to_email))


def send_password_reset_email(
    *,
    to_email: str,
    reset_url: str,
    expires_in_minutes: int,
) -> None:
    """Send the branded password-reset link to a resident."""
    subject, text_body, html_body = render_password_reset_email(
        reset_url=reset_url,
        expires_in_minutes=expires_in_minutes,
        recipient_email=to_email,
    )
    send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


def verify_connection() -> None:
    """Connect and authenticate without sending anything.

    Used by ``scripts/test_smtp.py`` (and handy for deployment checks) to
    confirm that the SMTP settings in ``backend/.env`` actually work. Raises
    :class:`EmailDeliveryError` when they do not.
    """
    client = _connect()
    try:
        client.noop()
        logger.info(
            "SMTP connection to %s:%s authenticated successfully.",
            settings.smtp_host,
            settings.smtp_port,
        )
    except (smtplib.SMTPException, OSError) as error:
        logger.error("SMTP server did not answer the connection check (%s).", type(error).__name__)
        raise EmailDeliveryError("SMTP connection check failed.") from error
    finally:
        try:
            client.quit()
        except (smtplib.SMTPException, OSError):
            client.close()
