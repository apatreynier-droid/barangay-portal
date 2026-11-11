"""SMTP email delivery for the Barangay Portal backend.

``send_email`` is the low-level transport; the ``send_*_email`` helpers build
on it with the templates from ``app/email_templates.py``.

Settings come from ``app.config.settings`` (``backend/.env``); the SMTP
password is never logged. Failures raise :class:`EmailDeliveryError` so
callers can show a friendly message.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from .config import settings
from .email_assets import inline_images_for
from .email_templates import (
    render_password_reset_email,
    render_registration_email,
    render_request_status_email,
)

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
    """Create a ``multipart/alternative`` message (text + optional HTML).

    When the HTML references Lucide icons (``cid:`` images, see
    ``app/email_assets.py``), the HTML part becomes ``multipart/related`` with
    those PNGs attached inline.
    """
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _sender_header()
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
        inline_images = inline_images_for(html_body)
        if inline_images:
            html_part = message.get_body(preferencelist=("html",))
            for content_id, png in inline_images:
                html_part.add_related(
                    png,
                    maintype="image",
                    subtype="png",
                    cid=f"<{content_id}>",
                    disposition="inline",
                )
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

    logger.info(
        "Email sent to %s (subject=%r).", mask_email(to_email), subject
    )


def send_document_status_email(
    *,
    to_email: str,
    resident_name: str,
    document_name: str,
    request_number: str,
    status: str,
    pickup_date: object | None = None,
    admin_remarks: str | None = None,
    event_time: object | None = None,
    portal_url: str = "",
    pickup_time: object | None = None,
    schedule_change: str | None = None,
) -> None:
    """Email a resident that one of their document requests changed status.

    ``to_email`` is the request owner's address, resolved by
    ``app/request_notifications.py``. Raises :class:`EmailDeliveryError` on
    failure; a failed email must never undo a saved status change.
    """
    subject, text_body, html_body = render_request_status_email(
        resident_name=resident_name,
        recipient_email=to_email,
        document_name=document_name,
        request_number=request_number,
        status=status,
        pickup_date=pickup_date,
        pickup_time=pickup_time,
        schedule_change=schedule_change,
        admin_remarks=admin_remarks,
        event_time=event_time,
        portal_url=portal_url,
    )
    send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


def send_registration_email(
    *,
    to_email: str,
    event: str,
    login_url: str,
    rejection_reason: object | None = None,
    resident_name: str = "",
    event_time: object | None = None,
) -> None:
    """Send one resident registration email.

    ``app/registration_emails.py`` decides when this runs and resolves
    ``to_email`` (and the resident's name) from the resident's own account.
    Raises :class:`EmailDeliveryError` when the message could not be delivered.
    """
    subject, text_body, html_body = render_registration_email(
        event=event,
        login_url=login_url,
        rejection_reason=str(rejection_reason or ""),
        resident_name=resident_name,
        recipient_email=to_email,
        event_time=event_time,
    )
    send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


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

    Used by ``scripts/test_smtp.py`` to verify the SMTP settings. Raises
    :class:`EmailDeliveryError` when they do not work.
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
