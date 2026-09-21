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

    return subject, text_body, html_body
