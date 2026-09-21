"""Transactional email templates for the Barangay Portal.

Templates are kept apart from the SMTP transport (``app/email_service.py``)
so the wording/branding can be edited without touching any mail code.

Every renderer returns a ``(subject, text_body, html_body)`` tuple: the plain
text part is always produced (some clients display only that), and the HTML
part is used when the recipient allows HTML mail.
"""

from __future__ import annotations

from html import escape

BRAND_NAME = "Barangay Lagab Document Portal"
BRAND_SUBTITLE = "Document Request &amp; Management System"
BRAND_REPUBLIC = "Republic of the Philippines"

# Placeholders are replaced with ``str.replace`` (see ``render_*`` below) so
# the CSS braces inside the templates never need escaping.
_PASSWORD_RESET_HTML = """\
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{subject}}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef1f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background-color:#eef1f6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0"
                 style="width:600px;max-width:600px;background-color:#ffffff;
                        border:1px solid #e4e8f1;border-radius:14px;
                        overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <!-- Header -->
            <tr>
              <td style="background-color:#152a63;padding:26px 32px;text-align:center;">
                <p style="margin:0 0 6px;font-size:11px;letter-spacing:2.2px;
                          text-transform:uppercase;color:#f2c14e;">
                  {{brand_republic}}
                </p>
                <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#ffffff;">
                  {{brand}}
                </h1>
                <p style="margin:0;font-size:13px;color:#c7d0e8;">
                  {{brand_subtitle}}
                </p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px 32px 8px;">
                <h2 style="margin:0 0 14px;font-size:20px;color:#152a63;">
                  Reset your password
                </h2>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
                  We received a request to reset the password for the
                  {{brand}} account registered to
                  <strong style="color:#1e293b;">{{recipient}}</strong>.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#475569;">
                  Click the button below to choose a new password. For your
                  security, the link can only be used once.
                </p>
              </td>
            </tr>
            <!-- Button -->
            <tr>
              <td align="center" style="padding:0 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background-color:#152a63;
                                               border-radius:8px;">
                      <a href="{{reset_url}}" target="_blank"
                         style="display:inline-block;padding:15px 34px;
                                font-size:15px;font-weight:bold;
                                color:#ffffff;text-decoration:none;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Expiry -->
            <tr>
              <td style="padding:22px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0"
                       cellspacing="0"
                       style="background-color:#eef1f8;border-radius:10px;">
                  <tr>
                    <td style="padding:18px 22px;">
                      <p style="margin:0 0 8px;font-size:13px;font-weight:bold;
                                color:#1e293b;">
                        This link expires in {{expiry}}
                      </p>
                      <p style="margin:0;font-size:12.5px;line-height:1.6;
                                color:#64748b;">
                        After it expires you can request a new reset link from
                        the Forgot Password page.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Link fallback -->
            <tr>
              <td style="padding:20px 32px 0;">
                <p style="margin:0 0 8px;font-size:12.5px;line-height:1.6;
                          color:#64748b;">
                  If the button does not work, copy this address into your
                  browser:
                </p>
                <p style="margin:0;font-size:12.5px;line-height:1.6;
                          word-break:break-all;color:#152a63;">
                  {{reset_url_text}}
                </p>
              </td>
            </tr>
            <!-- Not requested -->
            <tr>
              <td style="padding:26px 32px 32px;">
                <hr style="border:none;border-top:1px solid #e4e8f1;margin:0 0 22px;" />
                <p style="margin:0 0 12px;font-size:13px;font-weight:bold;
                          color:#1e293b;">
                  Didn&rsquo;t request a password reset?
                </p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.7;
                          color:#64748b;">
                  You can ignore this email &mdash; your password will stay the
                  same and nobody else can use this link. If you are concerned
                  about your account, contact the Barangay office so they can
                  check it with you.
                </p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">
                  Barangay staff will never ask you for your password.
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color:#f8fafc;padding:20px 32px;
                         border-top:1px solid #e4e8f1;">
                <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">
                  This is an automated message from the {{brand}}. Please do not
                  reply.
                </p>
                <p style="margin:0;font-size:12px;color:#94a3b8;">
                  Resetting a password signs you out of every device until you
                  sign in again with the new password.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

def render_password_reset_email(
    *,
    reset_url: str,
    expires_in_minutes: int,
    recipient_email: str,
) -> tuple[str, str, str]:
    """Build the password-reset email.

    Returns ``(subject, text_body, html_body)``. ``recipient_email`` and
    ``reset_url`` are treated as untrusted input and HTML-escaped wherever
    they are interpolated into the markup.
    """
    minutes = max(1, int(expires_in_minutes))
    expiry = f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"
    subject = f"{BRAND_NAME} - Password reset request"

    text_body = "\n".join(
        [
            BRAND_NAME.upper(),
            "Republic of the Philippines",
            "",
            "Reset your password",
            "",
            f"We received a request to reset the password for the {BRAND_NAME}",
            f"account registered to {recipient_email}.",
            "",
            f"Open this link to choose a new password (it expires in {expiry}",
            "and can only be used once):",
            "",
            reset_url,
            "",
            "Didn't request a password reset?",
            "You can ignore this email - your password will stay the same and",
            "nobody else can use the link above. If you are concerned about your",
            "account, contact the Barangay office so they can check it with you.",
            "Barangay staff will never ask you for your password.",
            "",
            "This is an automated message. Please do not reply.",
        ]
    )

    html_body = (
        _PASSWORD_RESET_HTML.replace("{{subject}}", escape(subject))
        .replace("{{brand_republic}}", BRAND_REPUBLIC)
        .replace("{{brand_subtitle}}", BRAND_SUBTITLE)
        .replace("{{brand}}", escape(BRAND_NAME))
        .replace("{{recipient}}", escape(recipient_email))
        .replace("{{expiry}}", escape(expiry))
        .replace("{{reset_url_text}}", escape(reset_url))
        .replace("{{reset_url}}", escape(reset_url, quote=True))
    )


# ---------------------------------------------------------------------------
# Document-request status notifications
# ---------------------------------------------------------------------------
# One entry per status that triggers an automatic email to the resident who
# owns the request. ``subject``/``headline``/``message`` are the wording shown
# in the email; ``note`` is an extra, status-specific closing paragraph.
STATUS_EMAIL_CONTENT: dict[str, dict[str, str]] = {
    "Approved": {
        "subject": "Your Barangay Document Request was Approved",
        "headline": "Your document request was approved",
        "message": (
            "Good news! The Barangay office has approved your document "
            "request. We will begin preparing your document and will email "
            "you again as soon as it is ready for pickup."
        ),
        "note": (
            "You can follow the progress of this request at any time under "
            "My Requests in the portal."
        ),
    },
    "Processing": {
        "subject": "Your Barangay Document is Being Processed",
        "headline": "Your document request is being processed",
        "message": (
            "Your document is now being prepared by the Barangay office. "
            "We will send you another email as soon as it is ready for "
            "pickup."
        ),
        "note": (
            "No action is needed from you at this time. Please keep your "
            "contact details up to date so we can reach you."
        ),
    },
    "Ready for Pickup": {
        "subject": "Your Barangay Document is Ready for Pickup",
        "headline": "Your document is ready for pickup",
        "message": (
            "Your requested document is now ready for pickup at the "
            "Barangay Lagab office. Please bring a valid ID and your request "
            "number when claiming the document. If somebody else will claim "
            "it for you, that person must bring an authorization letter and "
            "a copy of your valid ID."
        ),
        "note": (
            "Please claim your document on the scheduled pickup date. "
            "Unclaimed documents are kept at the Barangay office and can be "
            "released on the next working day."
        ),
    },
    "Completed": {
        "subject": "Your Barangay Document Request is Completed",
        "headline": "Your document request is completed",
        "message": (
            "Your document request has been marked as completed, which means "
            "the document has been released to you. Thank you for using the "
            "Barangay Lagab Document Portal."
        ),
        "note": (
            "If you did not receive your document, or if you need another "
            "copy, please contact the Barangay office so they can assist you."
        ),
    },
    "Rejected": {
        "subject": "Your Barangay Document Request was Rejected",
        "headline": "Your document request was rejected",
        "message": (
            "We are sorry to inform you that your document request was not "
            "approved by the Barangay office. You may visit or contact the "
            "Barangay office for more details, or submit a new request with "
            "complete information."
        ),
        "note": (
            "Any remarks given by the Barangay office are shown in this "
            "email. Submitting a new request with complete details will help "
            "us process it faster."
        ),
    },
}

#: Month names used to format the pickup date without depending on the
#: machine locale (``strftime('%B')`` is locale-sensitive).
_MONTH_NAMES = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)


def format_pickup_date(value: object) -> str:
    """Format a ``date``/``datetime``/ISO string as ``September 24, 2026``.

    Returns an empty string when the value cannot be interpreted, so callers
    can simply leave the pickup-date line out of the email.
    """
    if value is None:
        return ""

    year = getattr(value, "year", None)
    month = getattr(value, "month", None)
    day = getattr(value, "day", None)
    if year is None or month is None or day is None:
        # Fall back to ISO text such as "2026-09-24" (or the first 10 chars).
        text = str(value).strip()
        parts = text[:10].split("-")
        if len(parts) != 3 or not all(part.isdigit() for part in parts):
            return ""
        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])

    if not 1 <= int(month) <= 12:
        return ""
    return f"{_MONTH_NAMES[int(month) - 1]} {int(day)}, {int(year)}"


# Placeholders are replaced with ``str.replace`` (see
# ``render_request_status_email`` below) so the CSS braces inside the template
# never need escaping.
_REQUEST_STATUS_HTML = """\
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{subject}}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef1f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background-color:#eef1f6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0"
                 style="width:600px;max-width:600px;background-color:#ffffff;
                        border:1px solid #e4e8f1;border-radius:14px;
                        overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <!-- Header -->
            <tr>
              <td style="background-color:#152a63;padding:26px 32px;text-align:center;">
                <p style="margin:0 0 6px;font-size:11px;letter-spacing:2.2px;
                          text-transform:uppercase;color:#f2c14e;">
                  {{brand_republic}}
                </p>
                <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#ffffff;">
                  {{brand}}
                </h1>
                <p style="margin:0;font-size:13px;color:#c7d0e8;">
                  {{brand_subtitle}}
                </p>
              </td>
            </tr>
            <!-- Greeting and status message -->
            <tr>
              <td style="padding:32px 32px 0;">
                <h2 style="margin:0 0 14px;font-size:20px;color:#152a63;">
                  {{headline}}
                </h2>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
                  Hello <strong style="color:#1e293b;">{{resident_name}}</strong>,
                </p>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
                  {{message}}
                </p>
              </td>
            </tr>
            <!-- Request details -->
            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0"
                       cellspacing="0"
                       style="background-color:#f8fafc;border:1px solid #e4e8f1;
                              border-radius:10px;">
                  <tr>
                    <td style="padding:18px 22px;">
                      <p style="margin:0 0 10px;font-size:11px;letter-spacing:1.6px;
                                text-transform:uppercase;color:#94a3b8;">
                        Request details
                      </p>
                      <p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;
                                color:#475569;">
                        Request number:
                        <strong style="color:#1e293b;">{{request_number}}</strong>
                      </p>
                      <p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;
                                color:#475569;">
                        Document:
                        <strong style="color:#1e293b;">{{document_name}}</strong>
                      </p>
                      <p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;
                                color:#475569;">
                        Status:
                        <strong style="color:#152a63;">{{status}}</strong>
                      </p>
                      {{pickup_date_row}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            {{remarks_block}}
            <!-- Closing note -->
            <tr>
              <td style="padding:22px 32px 32px;">
                <p style="margin:0;font-size:13.5px;line-height:1.7;color:#64748b;">
                  {{note}}
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color:#f8fafc;padding:20px 32px;
                         border-top:1px solid #e4e8f1;">
                <p style="margin:0 0 4px;font-size:12px;line-height:1.6;
                          color:#94a3b8;">
                  This is an automated message from the {{brand}} about
                  document request {{request_number}}. Please do not reply.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
                  For questions about this request, contact the Barangay Lagab
                  office and mention the request number above.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

#: HTML row added to the details card only when a pickup date has been set.
_PICKUP_DATE_ROW = """\
<p style="margin:0;font-size:13.5px;line-height:1.6;color:#475569;">
                        Pickup date:
                        <strong style="color:#1e293b;">{{pickup_date}}</strong>
                      </p>
"""

#: HTML block added only when the admin left remarks on the request.
_REMARKS_BLOCK = """\
<tr>
              <td style="padding:18px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0"
                       cellspacing="0"
                       style="background-color:#fdf6e3;border:1px solid #f2c14e;
                              border-radius:10px;">
                  <tr>
                    <td style="padding:16px 22px;">
                      <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.6px;
                                text-transform:uppercase;color:#b07d12;">
                        Remarks from the Barangay office
                      </p>
                      <p style="margin:0;font-size:13.5px;line-height:1.7;
                                color:#475569;">
                        {{remarks}}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
"""


def render_request_status_email(
    *,
    resident_name: str,
    recipient_email: str,
    document_name: str,
    request_number: str,
    status: str,
    pickup_date: object | None = None,
    admin_remarks: str | None = None,
) -> tuple[str, str, str]:
    """Build the "your document request changed status" email.

    Returns ``(subject, text_body, html_body)``. ``resident_name``,
    ``document_name``, ``request_number``, ``admin_remarks`` and the email
    address come from the database and are treated as untrusted input, so they
    are HTML-escaped wherever they are interpolated into the markup.

    The recipient's registered address is only used for the "sent to" line at
    the bottom of the message - the actual ``To`` header is set by
    ``app/email_service.send_email`` from the address the caller resolved for
    the resident who owns the request.
    """
    content = STATUS_EMAIL_CONTENT.get(status) or {
        "subject": f"{BRAND_NAME} - Document request update",
        "headline": f"Your document request is now {status}",
        "message": (
            "The status of your document request has been updated by the "
            "Barangay office. Please open the portal to see the latest "
            "details of your request."
        ),
        "note": (
            "If you were not expecting this update, contact the Barangay "
            "office so they can check the request with you."
        ),
    }

    name = resident_name.strip() or "Resident"
    document = document_name.strip() or "Barangay document"
    number = request_number.strip() or "-"
    remarks = (admin_remarks or "").strip()
    if len(remarks) > 1000:
        remarks = f"{remarks[:997]}..."

    pickup_text = format_pickup_date(pickup_date)
    note = content["note"]
    if status == "Ready for Pickup" and not pickup_text:
        note = (
            f"{note} The pickup date has not been set yet - the Barangay "
            "office will confirm the schedule with you."
        )

    subject = content["subject"]

    text_lines = [
        BRAND_NAME.upper(),
        "Republic of the Philippines",
        "",
        content["headline"],
        "",
        f"Hello {name},",
        "",
        content["message"],
        "",
        "Request details",
        "---------------",
        f"Request number : {number}",
        f"Document       : {document}",
        f"Status         : {status}",
    ]
    if pickup_text:
        text_lines.append(f"Pickup date    : {pickup_text}")
    if remarks:
        text_lines += ["", "Remarks from the Barangay office:", remarks]
    text_lines += [
        "",
        note,
        "",
        BRAND_NAME,
        "Document Request & Management System",
        "",
        (
            f"This is an automated message sent to {recipient_email} about "
            f"document request {number}. Please do not reply."
        ),
    ]
    text_body = "\n".join(text_lines)

    pickup_date_row = (
        _PICKUP_DATE_ROW.replace("{{pickup_date}}", escape(pickup_text))
        if pickup_text
        else ""
    )
    remarks_block = (
        _REMARKS_BLOCK.replace("{{remarks}}", escape(remarks).replace("\n", "<br />"))
        if remarks
        else ""
    )

    html_body = (
        _REQUEST_STATUS_HTML.replace("{{subject}}", escape(subject))
        .replace("{{brand_republic}}", BRAND_REPUBLIC)
        .replace("{{brand_subtitle}}", BRAND_SUBTITLE)
        .replace("{{brand}}", escape(BRAND_NAME))
        .replace("{{headline}}", escape(content["headline"]))
        .replace("{{resident_name}}", escape(name))
        .replace("{{message}}", escape(content["message"]))
        .replace("{{request_number}}", escape(number))
        .replace("{{document_name}}", escape(document))
        .replace("{{status}}", escape(status))
        .replace("{{pickup_date_row}}", pickup_date_row)
        .replace("{{remarks_block}}", remarks_block)
        .replace("{{note}}", escape(note))
    )

    return subject, text_body, html_body
