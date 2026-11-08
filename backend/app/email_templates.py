"""Transactional email templates for the Barangay Portal.

Kept separate from the SMTP transport (``app/email_service.py``). Every
renderer returns ``(subject, text_body, html_body)``; the plain-text part is
always produced for clients that do not display HTML.

Design notes (Gmail / mobile compatibility):

* One shared layout (``_render_layout``) provides the header, content card and
  footer for every email.
* Nested ``<table>`` elements and inline styles only; the ``<style>`` block
  only tightens padding on phones.
* No remote images, web fonts, flexbox/grid or animation. Status icons are
  text glyphs, except the Completed email, which embeds Lucide PNG icons
  inline via ``cid:`` (see ``app/email_assets.py``).
* Every database or administrator value is HTML-escaped before interpolation.
* Times are shown in Philippine time; naive datetimes are treated as UTC.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from html import escape

from .email_assets import icon_img

BRAND_NAME = "Barangay Lagab Document Portal"
BRAND_SUBTITLE = "Document Request &amp; Management System"
BRAND_REPUBLIC = "Republic of the Philippines"

_BARANGAY = "Barangay Lagab"
_PORTAL_NAME = "Barangay Document Request & Management Portal"
_SIGNATURE = "Barangay Administration"
_OFFICE = "Barangay Lagab office"

#: Fixed UTC+8 offset (Manila has no DST); avoids needing the tz database on Windows.
MANILA_TIMEZONE = timezone(timedelta(hours=8), "PHT")

_MONTH_NAMES = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

# Palette -------------------------------------------------------------------
_NAVY = "#152a63"
_NAVY_SOFT = "#c7d0e8"
_GOLD = "#f2c14e"
_INK = "#1e293b"
_TEXT = "#475569"
_MUTED = "#64748b"
_FAINT = "#94a3b8"
_LINE = "#e4e8f1"
_PANEL = "#f8fafc"
_PAGE = "#eef1f6"
_FONT = "Arial,Helvetica,sans-serif"
_GLYPH_FONT = "Arial,'Segoe UI Symbol','Apple Symbols',Helvetica,sans-serif"

#: Status tones: text color, soft background, border and the icon glyph.
TONES: dict[str, dict[str, str]] = {
    "success": {"fg": "#15803d", "bg": "#dcfce7", "border": "#bbf7d0", "glyph": "&#10003;"},
    "warning": {"fg": "#b45309", "bg": "#fef3c7", "border": "#fde68a", "glyph": "&#8635;"},
    "danger": {"fg": "#b91c1c", "bg": "#fee2e2", "border": "#fecaca", "glyph": "&#10005;"},
    "info": {"fg": "#1d4ed8", "bg": "#dbeafe", "border": "#bfdbfe", "glyph": "i"},
    "neutral": {"fg": _NAVY, "bg": "#e8ecf6", "border": "#d5dcec", "glyph": "i"},
}


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------


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


def format_manila_datetime(value: object | None = None) -> str:
    """Format an event time as ``November 7, 2026 at 3:45 PM (PHT)``.

    ``None`` means "now". Naive datetimes (and ISO strings without an offset)
    come from the database, which stores UTC, so they are read as UTC and
    converted to Philippine time. Returns ``""`` for values it cannot read.
    """
    if value is None:
        moment = datetime.now(timezone.utc)
    elif isinstance(value, datetime):
        moment = value
    elif isinstance(value, date):
        return format_pickup_date(value)
    else:
        text = str(value).strip().replace("Z", "+00:00")
        try:
            moment = datetime.fromisoformat(text)
        except ValueError:
            return ""

    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local = moment.astimezone(MANILA_TIMEZONE)
    hour = local.hour % 12 or 12
    meridiem = "AM" if local.hour < 12 else "PM"
    return (
        f"{_MONTH_NAMES[local.month - 1]} {local.day}, {local.year} "
        f"at {hour}:{local.minute:02d} {meridiem} (PHT)"
    )


def _html_text(value: str) -> str:
    """Escape untrusted text and keep its line breaks."""
    return escape(value).replace("\n", "<br />")


# ---------------------------------------------------------------------------
# HTML building blocks (inline styles only)
# ---------------------------------------------------------------------------

_HEAD_STYLE = """\
<style>
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  a { color:#152a63; }
  @media only screen and (max-width:620px) {
    .email-outer { padding:12px 8px !important; }
    .email-pad { padding-left:22px !important; padding-right:22px !important; }
    .email-h1 { font-size:21px !important; line-height:1.3 !important; }
    .email-btn { width:100% !important; }
    .email-btn a { display:block !important; text-align:center !important; }
    .email-label { width:42% !important; }
  }
</style>"""


def _paragraph(html: str, *, color: str = _TEXT, size: str = "15px", margin: str = "0 0 16px") -> str:
    return (
        f'<p style="margin:{margin};font-family:{_FONT};font-size:{size};'
        f'line-height:1.65;color:{color};">{html}</p>'
    )


def _status_pill(label: str, tone: str) -> str:
    palette = TONES[tone]
    return (
        f'<span style="display:inline-block;padding:4px 12px;border-radius:999px;'
        f"background-color:{palette['bg']};border:1px solid {palette['border']};"
        f"color:{palette['fg']};font-family:{_FONT};font-size:12px;font-weight:bold;"
        f'letter-spacing:0.3px;white-space:nowrap;">&#9679;&nbsp;{escape(label)}</span>'
    )


def _details_card(title: str, rows: list[tuple[str, str]]) -> str:
    """Light-gray panel with label/value rows (values are trusted HTML)."""
    body = "".join(
        f"""
          <tr>
            <td class="email-label" valign="top" width="38%"
                style="width:38%;padding:9px 12px 9px 0;border-top:1px solid {_LINE};
                       font-family:{_FONT};font-size:13px;line-height:1.5;color:{_MUTED};">
              {escape(label)}
            </td>
            <td valign="top"
                style="padding:9px 0;border-top:1px solid {_LINE};font-family:{_FONT};
                       font-size:14px;line-height:1.5;color:{_INK};font-weight:bold;
                       word-break:break-word;">
              {value}
            </td>
          </tr>"""
        for label, value in rows
    )
    return f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin:8px 0 24px;background-color:{_PANEL};border:1px solid {_LINE};
                    border-radius:12px;">
        <tr>
          <td style="padding:16px 20px 8px;">
            <p style="margin:0 0 6px;font-family:{_FONT};font-size:11px;font-weight:bold;
                      letter-spacing:1.4px;text-transform:uppercase;color:{_FAINT};">
              {escape(title)}
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              {body}
            </table>
          </td>
        </tr>
      </table>"""


def _callout(title: str, body_html: str, tone: str) -> str:
    palette = TONES[tone]
    return f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin:0 0 24px;background-color:{palette['bg']};
                    border-left:4px solid {palette['fg']};border-radius:8px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-family:{_FONT};font-size:12px;font-weight:bold;
                      letter-spacing:0.8px;text-transform:uppercase;color:{palette['fg']};">
              {escape(title)}
            </p>
            <p style="margin:0;font-family:{_FONT};font-size:14.5px;line-height:1.65;
                      color:{_INK};word-break:break-word;">
              {body_html}
            </p>
          </td>
        </tr>
      </table>"""


def _checklist(title: str, items: list[str], tone: str = "neutral") -> str:
    """A titled list; bullets are table cells so spacing is identical everywhere."""
    palette = TONES[tone]
    rows = "".join(
        f"""
          <tr>
            <td valign="top" width="26" style="width:26px;padding:0 0 10px;">
              <div style="width:18px;height:18px;margin-top:1px;border-radius:9px;
                          background-color:{palette['bg']};color:{palette['fg']};
                          font-family:{_GLYPH_FONT};font-size:11px;font-weight:bold;
                          line-height:18px;text-align:center;">{index}</div>
            </td>
            <td valign="top" style="padding:0 0 10px;font-family:{_FONT};font-size:14.5px;
                                   line-height:1.6;color:{_TEXT};">
              {item}
            </td>
          </tr>"""
        for index, item in enumerate(items, start=1)
    )
    return f"""
      <p style="margin:0 0 12px;font-family:{_FONT};font-size:13px;font-weight:bold;
                letter-spacing:0.6px;text-transform:uppercase;color:{_NAVY};">
        {escape(title)}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin:0 0 14px;">
        {rows}
      </table>"""


def _button(label: str, url: str) -> str:
    """Bulletproof button (the whole cell is clickable in every client)."""
    href = escape(url, quote=True)
    return f"""
      <table role="presentation" cellpadding="0" cellspacing="0" class="email-btn"
             style="margin:4px 0 14px;">
        <tr>
          <td align="center" bgcolor="{_NAVY}"
              style="background-color:{_NAVY};border-radius:8px;">
            <a href="{href}" target="_blank" rel="noopener"
               style="display:inline-block;padding:14px 30px;font-family:{_FONT};
                      font-size:15px;font-weight:bold;line-height:1.2;color:#ffffff;
                      text-decoration:none;border-radius:8px;">
              {escape(label)}&nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>"""


def _link_fallback(url: str) -> str:
    return _paragraph(
        "If the button does not work, copy and paste this link into your browser:"
        f'<br /><a href="{escape(url, quote=True)}" target="_blank" rel="noopener" '
        f'style="color:{_NAVY};word-break:break-all;">{escape(url)}</a>',
        color=_MUTED,
        size="12.5px",
        margin="0 0 24px",
    )


def _pickup_panel(document: str, pickup_text: str, request_number: str) -> str:
    """The prominent "what / when / where" box of the Ready for Pickup email."""
    palette = TONES["success"]
    when = (
        escape(pickup_text)
        if pickup_text
        else '<span style="color:#b45309;">To be confirmed by the Barangay office</span>'
    )

    def cell(label: str, value: str, size: str) -> str:
        return f"""
              <tr>
                <td style="padding:0 0 14px;">
                  <p style="margin:0 0 3px;font-family:{_FONT};font-size:11px;font-weight:bold;
                            letter-spacing:1.2px;text-transform:uppercase;color:{palette['fg']};">
                    {label}
                  </p>
                  <p style="margin:0;font-family:{_FONT};font-size:{size};font-weight:bold;
                            line-height:1.35;color:{_INK};word-break:break-word;">
                    {value}
                  </p>
                </td>
              </tr>"""

    return f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin:8px 0 24px;background-color:#f0fdf4;border:2px solid {palette['border']};
                    border-radius:12px;">
        <tr>
          <td style="padding:20px 22px 6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              {cell("Document", escape(document), "19px")}
              {cell("Pickup date", when, "19px")}
              {cell("Where", escape(_OFFICE), "15px")}
              {cell("Request ID", escape(request_number), "15px")}
            </table>
          </td>
        </tr>
      </table>"""


def _render_layout(
    *,
    subject: str,
    preheader: str,
    tone: str,
    eyebrow: str,
    heading: str,
    content_html: str,
    footer_lines: list[str],
    show_icon: bool = True,
    hero_icon_html: str | None = None,
    signature_icon_html: str = "",
) -> str:
    """Shared email layout.

    Optional ``hero_icon_html`` (an icon ``<img>``) replaces the hero text
    glyph, and ``signature_icon_html`` adds an icon beside the signature.
    """
    palette = TONES[tone]
    if hero_icon_html is not None:
        icon = f"""
              <table role="presentation" align="center" cellpadding="0" cellspacing="0"
                     style="margin:0 auto 16px;">
                <tr>
                  <td align="center" valign="middle" width="64" height="64"
                      style="width:64px;height:64px;border-radius:32px;
                             background-color:{palette['bg']};text-align:center;">
                    <table role="presentation" align="center" cellpadding="0" cellspacing="0">
                      <tr><td>{hero_icon_html}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>"""
    else:
        icon = (
            f"""
              <table role="presentation" align="center" cellpadding="0" cellspacing="0"
                     style="margin:0 auto 16px;">
                <tr>
                  <td align="center" valign="middle" width="56" height="56"
                      style="width:56px;height:56px;border-radius:28px;
                             background-color:{palette['bg']};color:{palette['fg']};
                             font-family:{_GLYPH_FONT};font-size:26px;font-weight:bold;
                             line-height:56px;text-align:center;">
                    {palette['glyph']}
                  </td>
                </tr>
              </table>"""
            if show_icon
            else ""
        )
    signature = f"""<p style="margin:0 0 4px;font-family:{_FONT};font-size:14px;color:{_TEXT};">
                        Thank you,
                      </p>
                      <p style="margin:0;font-family:{_FONT};font-size:15px;font-weight:bold;
                                color:{_NAVY};">
                        {escape(_SIGNATURE)}
                      </p>
                      <p style="margin:2px 0 0;font-family:{_FONT};font-size:13px;color:{_MUTED};">
                        {escape(_BARANGAY)}
                      </p>"""
    if signature_icon_html:
        signature = f"""<p style="margin:0 0 10px;font-family:{_FONT};font-size:14px;color:{_TEXT};">
                        Thank you,
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td valign="middle" width="40" style="width:40px;">
                            <div style="width:40px;height:40px;border-radius:10px;
                                        background-color:#e8ecf6;">
                              <table role="presentation" width="40" height="40" cellpadding="0"
                                     cellspacing="0">
                                <tr><td align="center" valign="middle">{signature_icon_html}</td></tr>
                              </table>
                            </div>
                          </td>
                          <td valign="middle" style="padding-left:12px;">
                            <p style="margin:0;font-family:{_FONT};font-size:15px;font-weight:bold;
                                      color:{_NAVY};">
                              {escape(_SIGNATURE)}
                            </p>
                            <p style="margin:2px 0 0;font-family:{_FONT};font-size:13px;
                                      color:{_MUTED};">
                              {escape(_BARANGAY)}
                            </p>
                          </td>
                        </tr>
                      </table>"""
    footer = "".join(
        f'<p style="margin:0 0 6px;font-family:{_FONT};font-size:11.5px;'
        f'line-height:1.6;color:{_FAINT};">{line}</p>'
        for line in footer_lines
    )

    return f"""\
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>{escape(subject)}</title>
    {_HEAD_STYLE}
  </head>
  <body style="margin:0;padding:0;background-color:{_PAGE};">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;
                line-height:1px;color:{_PAGE};opacity:0;">
      {escape(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background-color:{_PAGE};">
      <tr>
        <td align="center" class="email-outer" style="padding:32px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0"
                 style="width:100%;max-width:600px;background-color:#ffffff;
                        border:1px solid {_LINE};border-radius:16px;overflow:hidden;">
            <!-- Header -->
            <tr>
              <td class="email-pad" style="background-color:{_NAVY};padding:24px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle" width="48" style="width:48px;">
                      <div style="width:44px;height:44px;border:2px solid {_GOLD};
                                  border-radius:24px;font-family:Georgia,'Times New Roman',serif;
                                  font-size:16px;font-weight:bold;line-height:44px;
                                  text-align:center;color:{_GOLD};">BL</div>
                    </td>
                    <td valign="middle" style="padding-left:14px;">
                      <p style="margin:0 0 3px;font-family:{_FONT};font-size:10.5px;
                                letter-spacing:2px;text-transform:uppercase;color:{_GOLD};">
                        {BRAND_REPUBLIC}
                      </p>
                      <p style="margin:0 0 2px;font-family:{_FONT};font-size:19px;
                                font-weight:bold;line-height:1.25;color:#ffffff;">
                        {escape(BRAND_NAME)}
                      </p>
                      <p style="margin:0;font-family:{_FONT};font-size:12.5px;color:{_NAVY_SOFT};">
                        {BRAND_SUBTITLE}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td height="4" style="height:4px;line-height:4px;font-size:4px;
                                    background-color:{_GOLD};">&nbsp;</td>
            </tr>
            <!-- Hero -->
            <tr>
              <td class="email-pad" align="center" style="padding:36px 40px 8px;text-align:center;">
                {icon}
                <p style="margin:0 0 8px;font-family:{_FONT};font-size:12px;font-weight:bold;
                          letter-spacing:1.6px;text-transform:uppercase;color:{palette['fg']};">
                  {escape(eyebrow)}
                </p>
                <h1 class="email-h1" style="margin:0 0 8px;font-family:{_FONT};font-size:24px;
                                            line-height:1.3;font-weight:bold;color:{_NAVY};">
                  {escape(heading)}
                </h1>
              </td>
            </tr>
            <!-- Content -->
            <tr>
              <td class="email-pad" style="padding:20px 40px 12px;">
                {content_html}
              </td>
            </tr>
            <!-- Support -->
            <tr>
              <td class="email-pad" style="padding:0 40px 30px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                       style="border-top:1px solid {_LINE};">
                  <tr>
                    <td style="padding-top:20px;">
                      {signature}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td class="email-pad" align="center"
                  style="background-color:{_PANEL};border-top:1px solid {_LINE};
                         padding:22px 40px;text-align:center;">
                <p style="margin:0 0 4px;font-family:{_FONT};font-size:12.5px;font-weight:bold;
                          color:{_NAVY};">
                  {escape(_SIGNATURE)} &middot; {escape(_BARANGAY)}
                </p>
                <p style="margin:0 0 12px;font-family:{_FONT};font-size:11.5px;color:{_MUTED};">
                  {escape(_PORTAL_NAME)} &middot; {BRAND_REPUBLIC}
                </p>
                {footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


# ---------------------------------------------------------------------------
# Plain-text building blocks
# ---------------------------------------------------------------------------

_TEXT_RULE = "=" * 56
_TEXT_THIN_RULE = "-" * 56


def _text_header(heading: str, status_label: str | None = None) -> list[str]:
    lines = [
        BRAND_NAME.upper(),
        f"{BRAND_REPUBLIC} | {_SIGNATURE}",
        _TEXT_RULE,
        "",
        heading.upper(),
    ]
    if status_label:
        lines.append(f"Status: {status_label.upper()}")
    lines.append("")
    return lines


def _text_rows(title: str, rows: list[tuple[str, str]]) -> list[str]:
    width = max(len(label) for label, _ in rows)
    return [
        title.upper(),
        _TEXT_THIN_RULE,
        *(f"{label.ljust(width)} : {value}" for label, value in rows),
        "",
    ]


def _text_list(title: str, items: list[str]) -> list[str]:
    return [
        title.upper(),
        _TEXT_THIN_RULE,
        *(f"{index}. {item}" for index, item in enumerate(items, start=1)),
        "",
    ]


def _text_footer(lines: list[str]) -> list[str]:
    return [
        "Thank you,",
        _SIGNATURE,
        _BARANGAY,
        "",
        _TEXT_THIN_RULE,
        f"{BRAND_NAME} | {BRAND_REPUBLIC}",
        *lines,
    ]


def _recipient_footer(recipient_email: str, context: str) -> tuple[list[str], list[str]]:
    """Footer lines as (html, text): who it was sent to and why."""
    sent_to = f"This automated message was sent to {recipient_email}" if recipient_email else (
        "This is an automated message"
    )
    text = f"{sent_to} {context} Please do not reply to this email."
    html_sent_to = (
        "This automated message was sent to "
        f'<span style="color:{_MUTED};">{escape(recipient_email)}</span>'
        if recipient_email
        else "This is an automated message"
    )
    html = f"{html_sent_to} {escape(context)} Please do not reply to this email."
    return [html], [text]


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


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
    requested_at = format_manila_datetime()

    content = "".join(
        [
            _paragraph(
                "We received a request to reset the password for the account "
                f'registered to <strong style="color:{_INK};">{escape(recipient_email)}</strong>.'
            ),
            _paragraph(
                "Click the button below to choose a new password. For your security, "
                "the link can only be used once."
            ),
            _button("Reset Password", reset_url),
            _link_fallback(reset_url),
            _callout(
                f"This link expires in {expiry}",
                "After it expires you can request a new reset link from the Forgot "
                f"Password page. Requested on {escape(requested_at)}.",
                "warning",
            ),
            _paragraph(
                f'<strong style="color:{_INK};">Didn&rsquo;t request a password reset?</strong><br />'
                "You can ignore this email &mdash; your password will stay the same and "
                "nobody else can use this link. If you are concerned about your account, "
                "contact the Barangay office. Barangay staff will never ask you for your "
                "password.",
                color=_MUTED,
                size="13.5px",
            ),
        ]
    )
    footer_html, footer_text = _recipient_footer(
        recipient_email,
        "because a password reset was requested for this account. Resetting a password "
        "signs you out of every device.",
    )

    html_body = _render_layout(
        subject=subject,
        preheader=f"Use this link within {expiry} to choose a new password.",
        tone="info",
        eyebrow="Account security",
        heading="Reset Your Password",
        content_html=content,
        footer_lines=footer_html,
    )

    text_body = "\n".join(
        [
            *_text_header("Reset your password"),
            f"We received a request to reset the password for the {BRAND_NAME}",
            f"account registered to {recipient_email}.",
            "",
            f"Open this link to choose a new password (it expires in {expiry}",
            "and can only be used once):",
            "",
            reset_url,
            "",
            f"Requested on {requested_at}.",
            "",
            "Didn't request a password reset?",
            "You can ignore this email - your password will stay the same and",
            "nobody else can use the link above. If you are concerned about your",
            "account, contact the Barangay office so they can check it with you.",
            "Barangay staff will never ask you for your password.",
            "",
            *_text_footer(footer_text),
        ]
    )

    return subject, text_body, html_body


# ---------------------------------------------------------------------------
# Document-request status notifications
# ---------------------------------------------------------------------------
# One entry per status with a resident email. Which statuses actually send is
# decided by NOTIFIABLE_STATUSES in app/request_notifications.py; "Pending" is
# defined here but only sent if a trigger is added for it.
STATUS_EMAIL_CONTENT: dict[str, dict[str, object]] = {
    "Pending": {
        "subject": "We Received Your Barangay Document Request",
        "eyebrow": "Request received",
        "headline": "We Received Your Document Request",
        "tone": "info",
        "pill": "Received",
        "message": (
            "Thank you! Your document request has been submitted successfully and "
            "is now waiting for review by the Barangay office."
        ),
        "steps_title": "What happens next",
        "steps": [
            "The Barangay office reviews your request and supporting image.",
            "You will receive an email when your request is approved or if it "
            "needs your attention.",
            "You can follow your request at any time under My Requests.",
        ],
    },
    "Approved": {
        "subject": "Your Barangay Document Request was Approved",
        "eyebrow": "Request approved",
        "headline": "Your Document Request Was Approved",
        "tone": "success",
        "pill": "Approved",
        "message": (
            "Good news! The Barangay office has approved your document request. "
            "We will begin preparing your document and will email you again as soon "
            "as it is ready for pickup."
        ),
        "steps_title": "What happens next",
        "steps": [
            "The Barangay office prepares your document.",
            "You will receive another email when it is ready for pickup.",
            "You can follow the progress of this request under My Requests.",
        ],
    },
    "Processing": {
        "subject": "Your Barangay Document is Being Processed",
        "eyebrow": "In progress",
        "headline": "Your Document Is Being Processed",
        "tone": "warning",
        "pill": "Processing",
        "message": (
            "Your document is now being prepared by the Barangay office. We will send "
            "you another email as soon as it is ready for pickup."
        ),
        "steps_title": "Good to know",
        "steps": [
            "No action is needed from you at this time.",
            "Please keep your contact details up to date so we can reach you.",
        ],
    },
    "Ready for Pickup": {
        "subject": "Your Barangay Document is Ready for Pickup",
        "eyebrow": "Ready for pickup",
        "headline": "Your Document Is Ready for Pickup",
        "tone": "success",
        "pill": "Ready for Pickup",
        "message": (
            f"Your requested document is now ready for pickup at the {_OFFICE}. "
            "Please review the pickup details and instructions below."
        ),
        "steps_title": "Pickup instructions",
        "steps": [
            "Bring a valid ID and your request number when claiming the document.",
            "If somebody else will claim it for you, that person must bring an "
            "authorization letter and a copy of your valid ID.",
            "Please claim your document on the scheduled pickup date. Unclaimed "
            "documents are kept at the Barangay office and can be released on the "
            "next working day.",
        ],
    },
    "Completed": {
        "subject": "Your Barangay Document Request is Completed",
        "eyebrow": "Request completed",
        "headline": "Your Document Request Is Completed",
        "tone": "success",
        "pill": "Completed",
        "message": (
            "Your document request has been marked as completed, which means the "
            f"document has been released to you. Thank you for using the {BRAND_NAME}."
        ),
        "steps_title": "Need help?",
        "steps": [
            "If you did not receive your document, or if you need another copy, "
            "please contact the Barangay office so they can assist you.",
        ],
    },
    "Rejected": {
        "subject": "Your Barangay Document Request was Rejected",
        "eyebrow": "Request not approved",
        "headline": "Your Document Request Was Rejected",
        "tone": "danger",
        "pill": "Rejected",
        "message": (
            "We are sorry to inform you that your document request was not approved "
            "by the Barangay office."
        ),
        "steps_title": "What you can do",
        "steps": [
            "Review the remarks from the Barangay office shown in this email.",
            "Submit a new request with complete and correct information.",
            "Visit or contact the Barangay office if you need more details.",
        ],
    },
}

_FALLBACK_STATUS_CONTENT: dict[str, object] = {
    "subject": f"{BRAND_NAME} - Document request update",
    "eyebrow": "Request update",
    "headline": "Your Document Request Was Updated",
    "tone": "info",
    "pill": "",
    "message": (
        "The status of your document request has been updated by the Barangay "
        "office. Please open the portal to see the latest details of your request."
    ),
    "steps_title": "Questions?",
    "steps": [
        "If you were not expecting this update, contact the Barangay office so "
        "they can check the request with you.",
    ],
}


#: Lucide icon sizes in the Completed email: one size for the hero, one for
#: every other icon (always centered in the same 40px rounded tile).
_HERO_ICON_SIZE = 32
_ICON_SIZE = 22
_ICON_TILE = 40


def _icon_tile(icon_name: str, background: str) -> str:
    """A Lucide icon centered in a 40px rounded tile (table-based for Gmail)."""
    return f"""
                <table role="presentation" width="{_ICON_TILE}" height="{_ICON_TILE}"
                       cellpadding="0" cellspacing="0"
                       style="width:{_ICON_TILE}px;height:{_ICON_TILE}px;border-radius:10px;
                              background-color:{background};">
                  <tr>
                    <td align="center" valign="middle">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr><td>{icon_img(icon_name, _ICON_SIZE)}</td></tr>
                      </table>
                    </td>
                  </tr>
                </table>"""


def _icon_info_row(icon_name: str, tile_bg: str, label: str, value_html: str,
                   sub_html: str = "", *, divider: bool = False) -> str:
    border = f"border-top:1px solid {_LINE};" if divider else ""
    sub = (
        f'<p style="margin:3px 0 0;font-family:{_FONT};font-size:13px;color:{_MUTED};">'
        f"{sub_html}</p>"
        if sub_html
        else ""
    )
    return f"""
          <tr>
            <td valign="middle" width="{_ICON_TILE}"
                style="width:{_ICON_TILE}px;padding:14px 0;{border}">
              {_icon_tile(icon_name, tile_bg)}
            </td>
            <td valign="middle" style="padding:14px 0 14px 14px;{border}">
              <p style="margin:0 0 3px;font-family:{_FONT};font-size:11px;font-weight:bold;
                        letter-spacing:1.2px;text-transform:uppercase;color:{_FAINT};">
                {escape(label)}
              </p>
              <p style="margin:0;font-family:{_FONT};font-size:16px;font-weight:bold;
                        line-height:1.4;color:{_INK};word-break:break-word;">
                {value_html}
              </p>
              {sub}
            </td>
          </tr>"""


def _render_completed_email(
    *,
    subject: str,
    content: dict[str, object],
    name: str,
    recipient_email: str,
    document: str,
    number: str,
    remarks: str,
    remarks_title: str,
    completed_text: str,
) -> tuple[str, str, str]:
    """"Your Document Request Is Completed" email, with Lucide icons.

    The request is closed, so the "View My Requests" button is intentionally omitted.
    """
    green = TONES["success"]
    help_title = "Did not receive your document?"
    help_text = str(content["steps"][0])  # type: ignore[index]

    status_banner = f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin:8px 0 20px;background-color:#f0fdf4;
                    border:2px solid {green['border']};border-radius:12px;">
        <tr>
          <td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle" width="{_ICON_TILE}" style="width:{_ICON_TILE}px;">
                  {_icon_tile("circle-check", "#ffffff")}
                </td>
                <td valign="middle" style="padding-left:14px;">
                  <p style="margin:0 0 2px;font-family:{_FONT};font-size:11px;font-weight:bold;
                            letter-spacing:1.2px;text-transform:uppercase;color:{green['fg']};">
                    Request status
                  </p>
                  <p style="margin:0;font-family:{_FONT};font-size:22px;font-weight:bold;
                            line-height:1.25;color:{green['fg']};">
                    Completed
                  </p>
                  <p style="margin:4px 0 0;font-family:{_FONT};font-size:13.5px;
                            line-height:1.5;color:#166534;">
                    This request is closed &mdash; your document has been released.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>"""

    summary_rows = _icon_info_row(
        "file-check",
        green["bg"],
        "Document",
        escape(document),
        f"Request ID&nbsp; <strong style=\"color:{_INK};\">{escape(number)}</strong>",
    ) + _icon_info_row(
        "calendar-days",
        "#e8ecf6",
        "Completion date",
        escape(completed_text),
        divider=True,
    )
    summary = f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin:0 0 24px;background-color:{_PANEL};border:1px solid {_LINE};
                    border-radius:12px;">
        <tr>
          <td style="padding:6px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              {summary_rows}
            </table>
          </td>
        </tr>
      </table>"""

    blocks = [
        _paragraph(f'Hello <strong style="color:{_INK};">{escape(name)}</strong>,'),
        _paragraph(escape(str(content["message"]))),
        status_banner,
        summary,
    ]
    if remarks:
        blocks.append(_callout(remarks_title, _html_text(remarks), "warning"))
    blocks.append(
        _paragraph(
            f'<strong style="color:{_INK};">{escape(help_title)}</strong><br />'
            f"{escape(help_text)}",
            color=_MUTED,
            size="14px",
            margin="0 0 8px",
        )
    )

    footer_html, footer_text = _recipient_footer(
        recipient_email,
        f"about document request {number}. For questions, contact the {_OFFICE} "
        "and mention this request ID.",
    )
    html_body = _render_layout(
        subject=subject,
        preheader=f"{document} ({number}) has been released. Your request is complete.",
        tone="success",
        eyebrow=str(content["eyebrow"]),
        heading=str(content["headline"]),
        content_html="".join(blocks),
        footer_lines=footer_html,
        hero_icon_html=icon_img("circle-check", _HERO_ICON_SIZE),
        signature_icon_html=icon_img("building-2", _ICON_SIZE),
    )

    text_lines = [
        *_text_header(str(content["headline"]), "Completed"),
        f"Hello {name},",
        "",
        str(content["message"]),
        "",
        *_text_rows(
            "Completion summary",
            [
                ("Document", document),
                ("Request ID", number),
                ("Status", "Completed"),
                ("Completed on", completed_text),
            ],
        ),
    ]
    if remarks:
        text_lines += [f"{remarks_title.upper()}:", remarks, ""]
    text_lines += [help_title.upper(), help_text, ""]
    text_lines += _text_footer(footer_text)

    return subject, "\n".join(text_lines), html_body


def render_request_status_email(
    *,
    resident_name: str,
    recipient_email: str,
    document_name: str,
    request_number: str,
    status: str,
    pickup_date: object | None = None,
    admin_remarks: str | None = None,
    event_time: object | None = None,
    portal_url: str = "",
) -> tuple[str, str, str]:
    """Build the "your document request changed status" email.

    Returns ``(subject, text_body, html_body)``. All database values are
    treated as untrusted and HTML-escaped. ``event_time`` is the UTC status
    change time (``None`` means now); ``portal_url`` adds a "View My Requests"
    button. ``recipient_email`` only fills the "sent to" footer line; the
    ``To`` header is set by ``app/email_service.send_email``.
    """
    content = STATUS_EMAIL_CONTENT.get(status) or _FALLBACK_STATUS_CONTENT
    tone = str(content["tone"])
    pill = str(content["pill"]) or status
    steps = [str(step) for step in content["steps"]]  # type: ignore[union-attr]

    name = resident_name.strip() or "Resident"
    document = document_name.strip() or "Barangay document"
    number = request_number.strip() or "-"
    remarks = (admin_remarks or "").strip()
    if len(remarks) > 1000:
        remarks = f"{remarks[:997]}..."

    pickup_text = format_pickup_date(pickup_date)
    updated_text = format_manila_datetime(event_time)
    is_pickup = status == "Ready for Pickup"
    if is_pickup and not pickup_text:
        steps.append(
            "The pickup date has not been set yet - the Barangay office will confirm "
            "the schedule with you."
        )

    subject = str(content["subject"])
    remarks_title = (
        "Reason from the Barangay office"
        if status == "Rejected"
        else "Pickup instructions from the Barangay office"
        if is_pickup
        else "Remarks from the Barangay office"
    )

    if status == "Completed":
        return _render_completed_email(
            subject=subject,
            content=content,
            name=name,
            recipient_email=recipient_email,
            document=document,
            number=number,
            remarks=remarks,
            remarks_title=remarks_title,
            completed_text=updated_text,
        )

    # ------------------------------------------------------------- HTML part
    detail_rows = [
        ("Request ID", escape(number)),
        ("Document", escape(document)),
        ("Status", _status_pill(pill, tone)),
    ]
    if pickup_text and not is_pickup:
        detail_rows.append(("Pickup date", escape(pickup_text)))
    detail_rows.append(("Updated", escape(updated_text)))

    blocks = [
        _paragraph(f'Hello <strong style="color:{_INK};">{escape(name)}</strong>,'),
        _paragraph(escape(str(content["message"]))),
    ]
    if is_pickup:
        blocks.append(_pickup_panel(document, pickup_text, number))
    if remarks:
        remarks_tone = "danger" if status == "Rejected" else "warning"
        blocks.append(_callout(remarks_title, _html_text(remarks), remarks_tone))
    blocks.append(_details_card("Request details", detail_rows))
    blocks.append(_checklist(str(content["steps_title"]), [escape(s) for s in steps], tone))
    if portal_url:
        blocks.append(_button("View My Requests", portal_url))

    footer_html, footer_text = _recipient_footer(
        recipient_email,
        f"about document request {number}. For questions, contact the {_OFFICE} "
        "and mention this request ID.",
    )

    preheader = (
        f"{document} ({number}) is ready for pickup"
        + (f" on {pickup_text}." if pickup_text else ".")
        if is_pickup
        else f"{document} ({number}): {pill}."
    )

    html_body = _render_layout(
        subject=subject,
        preheader=preheader,
        tone=tone,
        eyebrow=str(content["eyebrow"]),
        heading=str(content["headline"]),
        content_html="".join(blocks),
        footer_lines=footer_html,
    )

    # -------------------------------------------------------- plain-text part
    text_lines = [
        *_text_header(str(content["headline"]), pill),
        f"Hello {name},",
        "",
        str(content["message"]),
        "",
    ]
    if is_pickup:
        text_lines += _text_rows(
            "Pickup details",
            [
                ("Document", document),
                ("Pickup date", pickup_text or "To be confirmed by the Barangay office"),
                ("Where", _OFFICE),
                ("Request ID", number),
            ],
        )
    if remarks:
        text_lines += [f"{remarks_title.upper()}:", remarks, ""]

    rows = [("Request ID", number), ("Document", document), ("Status", status)]
    if pickup_text and not is_pickup:
        rows.append(("Pickup date", pickup_text))
    rows.append(("Updated", updated_text))
    text_lines += _text_rows("Request details", rows)
    text_lines += _text_list(str(content["steps_title"]), steps)
    if portal_url:
        text_lines += ["View your requests:", portal_url, ""]
    text_lines += _text_footer(footer_text)

    return subject, "\n".join(text_lines), html_body


# ---------------------------------------------------------------------------
# Resident registration emails (registered / approved / rejected)
# ---------------------------------------------------------------------------

EVENT_REGISTERED = "registered"
EVENT_APPROVED = "approved"
EVENT_REJECTED = "rejected"

#: Subjects agreed with the Barangay (checked by scripts/test_registration_approval.py).
_REGISTRATION_SUBJECTS = {
    EVENT_REGISTERED: "Barangay Portal - Registration Successfully Received",
    EVENT_APPROVED: "Your Barangay Portal Account Has Been Approved!",
    EVENT_REJECTED: "Barangay Portal - Registration Status Update",
}


def render_registration_email(
    *,
    event: str,
    login_url: str = "",
    rejection_reason: str = "",
    resident_name: str = "",
    recipient_email: str = "",
    event_time: object | None = None,
) -> tuple[str, str, str]:
    """Build one registration email as ``(subject, text_body, html_body)``.

    All user/administrator-supplied values are HTML-escaped. ``event_time`` is
    the UTC submission or review time (``None`` means now). Raises
    ``KeyError`` for an unknown event.
    """
    subject = _REGISTRATION_SUBJECTS[event]
    name = resident_name.strip()
    greeting_name = name or "Resident"
    when = format_manila_datetime(event_time)
    reason = rejection_reason.strip() or "No reason was provided."

    account_rows: list[tuple[str, str]] = []
    if name:
        account_rows.append(("Name", name))
    if recipient_email:
        account_rows.append(("Email", recipient_email))

    if event == EVENT_REGISTERED:
        tone, pill, eyebrow = "warning", "Pending Approval", "Registration received"
        heading = "Registration Successfully Received"
        preheader = "Your account is pending approval by the Barangay Administrator."
        paragraphs = [
            f"Thank you for registering with the {_PORTAL_NAME}. We have successfully "
            "received your registration information.",
            "Your account is currently pending approval and will be reviewed by the "
            "Barangay Administrator.",
        ]
        rows = [*account_rows, ("Account status", pill), ("Submitted", when)]
        steps_title = "What happens next"
        steps = [
            "The Barangay Administrator reviews your registration details.",
            "You will receive another email notification once your registration has "
            "been approved or rejected.",
            "Please wait for the confirmation before attempting to access your "
            "Resident Portal account.",
        ]
        extra_html = ""
        extra_text: list[str] = []
    elif event == EVENT_APPROVED:
        tone, pill, eyebrow = "success", "Active", "Account approved"
        heading = "Your Account Has Been Approved!"
        preheader = "Your Resident Portal account is now active. You can sign in."
        paragraphs = [
            f"Good news! Your registration for the {_PORTAL_NAME} has been successfully "
            "reviewed and approved by the Barangay Administrator.",
            "Your account is now ACTIVE, and you can officially log in to the Resident "
            "Portal.",
        ]
        rows = [*account_rows, ("Account status", "ACTIVE"), ("Approved on", when)]
        steps_title = "What you can do now"
        steps = [
            "Request barangay documents online.",
            "Monitor the status of your document requests.",
            "Receive email updates when your documents are ready for pickup.",
        ]
        extra_html = (
            _button("Login to Your Account", login_url) + _link_fallback(login_url)
            if login_url
            else ""
        )
        extra_text = ["Login to your account:", login_url, ""] if login_url else []
    elif event == EVENT_REJECTED:
        tone, pill, eyebrow = "danger", "Rejected", "Registration update"
        heading = "Your Registration Was Not Approved"
        preheader = "Your registration was reviewed. See the reason and next steps."
        paragraphs = [
            f"Thank you for registering with the {_PORTAL_NAME}.",
            "After reviewing your registration, we regret to inform you that your "
            "application has been rejected.",
        ]
        rows = [*account_rows, ("Account status", pill), ("Reviewed on", when)]
        steps_title = "What you can do"
        steps = [
            "You may register again using this same email address once the issue "
            "above has been resolved.",
            "For questions or further assistance, please contact the Barangay "
            f"Administrator or visit the {_OFFICE}.",
        ]
        extra_html = _callout("Reason for rejection", _html_text(reason), "danger")
        extra_text = ["REASON FOR REJECTION:", reason, ""]
    else:  # pragma: no cover - guarded by the KeyError above
        raise KeyError(event)

    # ------------------------------------------------------------- HTML part
    html_rows = [
        (label, _status_pill(pill, tone) if label == "Account status" else escape(value))
        for label, value in rows
    ]
    blocks = [
        _paragraph(f'Dear <strong style="color:{_INK};">{escape(greeting_name)}</strong>,'),
        *(_paragraph(escape(text)) for text in paragraphs),
    ]
    if event == EVENT_REJECTED:
        blocks.append(extra_html)
    blocks.append(_details_card("Registration details", html_rows))
    if event == EVENT_APPROVED:
        blocks.append(extra_html)
    blocks.append(_checklist(steps_title, [escape(s) for s in steps], tone))

    footer_html, footer_text = _recipient_footer(
        recipient_email, f"about your {BRAND_NAME} registration."
    )
    html_body = _render_layout(
        subject=subject,
        preheader=preheader,
        tone=tone,
        eyebrow=eyebrow,
        heading=heading,
        content_html="".join(blocks),
        footer_lines=footer_html,
    )

    # -------------------------------------------------------- plain-text part
    text_lines = [*_text_header(heading, pill), f"Dear {greeting_name},", ""]
    for text in paragraphs:
        text_lines += [text, ""]
    if event == EVENT_REJECTED:
        text_lines += extra_text
    text_lines += _text_rows("Registration details", rows)
    if event == EVENT_APPROVED:
        text_lines += extra_text
    text_lines += _text_list(steps_title, steps)
    text_lines += _text_footer(footer_text)

    return subject, "\n".join(text_lines), html_body
