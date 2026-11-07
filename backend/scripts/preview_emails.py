r"""Render every portal email to local HTML files for visual review.

Nothing is sent: this only calls the template renderers in
``app/email_templates.py`` with clearly marked SAMPLE data and writes

* ``<out>/<name>.html``  - the HTML email exactly as a mail client receives it
* ``<out>/<name>.txt``   - its plain-text fallback
* ``<out>/index.html``   - a gallery showing each email at desktop (600px) and
                           phone (375px) width next to its plain-text version

    cd backend
    .\.venv\Scripts\Activate.ps1
    python scripts\preview_emails.py              # writes backend/email_previews/
    python scripts\preview_emails.py C:\temp\out  # or any folder
"""

from __future__ import annotations

import datetime as dt
import sys
from html import escape
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.email_assets import html_with_data_uris  # noqa: E402
from app.email_templates import (  # noqa: E402
    EVENT_APPROVED,
    EVENT_REGISTERED,
    EVENT_REJECTED,
    render_password_reset_email,
    render_registration_email,
    render_request_status_email,
)

# SAMPLE data for previews only - real emails use the database values.
SAMPLE_NAME = "Maria Clara Santos"
SAMPLE_EMAIL = "maria.santos@example.com"
SAMPLE_PORTAL = "http://localhost:5173"
SAMPLE_EVENT_UTC = dt.datetime(2026, 11, 7, 6, 45)  # = 2:45 PM in Manila
SAMPLE_PICKUP = dt.date(2026, 11, 12)


def build_previews() -> list[tuple[str, str, tuple[str, str, str]]]:
    request = {
        "resident_name": SAMPLE_NAME,
        "recipient_email": SAMPLE_EMAIL,
        "document_name": "Barangay Clearance",
        "request_number": "REQ-2026-000184",
        "event_time": SAMPLE_EVENT_UTC,
        "portal_url": f"{SAMPLE_PORTAL}/myRequests",
    }
    registration = {
        "resident_name": SAMPLE_NAME,
        "recipient_email": SAMPLE_EMAIL,
        "event_time": SAMPLE_EVENT_UTC,
    }
    return [
        ("registration-received", "A. Registration received",
         render_registration_email(event=EVENT_REGISTERED, **registration)),
        ("registration-approved", "B. Account approved",
         render_registration_email(
             event=EVENT_APPROVED, login_url=f"{SAMPLE_PORTAL}/login", **registration)),
        ("registration-rejected", "C. Account rejected",
         render_registration_email(
             event=EVENT_REJECTED,
             rejection_reason=(
                 "The uploaded proof of residency is not readable. Please register "
                 "again with a clear photo of your barangay ID or utility bill."
             ),
             **registration)),
        ("request-received", "D1. Request received (template only, not triggered)",
         render_request_status_email(status="Pending", **request)),
        ("request-approved", "D2. Request approved",
         render_request_status_email(status="Approved", **request)),
        ("request-rejected", "D3. Request rejected",
         render_request_status_email(
             status="Rejected",
             admin_remarks="The purpose stated does not match the requested document.",
             **request)),
        ("request-processing", "D4. Request processing",
         render_request_status_email(status="Processing", **request)),
        ("request-ready", "D5. Ready for pickup",
         render_request_status_email(
             status="Ready for Pickup",
             pickup_date=SAMPLE_PICKUP,
             admin_remarks="Office hours for releasing: 8:00 AM - 5:00 PM, Window 2.",
             **request)),
        ("request-ready-no-date", "D5b. Ready for pickup (no date set yet)",
         render_request_status_email(status="Ready for Pickup", **request)),
        ("request-completed", "D6. Request completed",
         render_request_status_email(status="Completed", **request)),
        ("password-reset", "E. Password reset",
         render_password_reset_email(
             reset_url=f"{SAMPLE_PORTAL}/reset-password?token=SAMPLE-TOKEN",
             expires_in_minutes=15,
             recipient_email=SAMPLE_EMAIL)),
    ]


GALLERY_STYLE = """
  body { margin:0; padding:24px; background:#0f172a; color:#e2e8f0;
         font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  h1 { margin:0 0 4px; font-size:20px; }
  .lead { margin:0 0 24px; color:#94a3b8; font-size:14px; }
  nav { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:28px; }
  nav a { padding:6px 12px; border-radius:999px; background:#1e293b; color:#cbd5e1;
          font-size:13px; text-decoration:none; }
  section { margin-bottom:48px; }
  h2 { margin:0 0 4px; font-size:16px; }
  .subject { margin:0 0 14px; color:#94a3b8; font-size:13px; }
  .row { display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start; }
  figure { margin:0; }
  figcaption { margin-bottom:6px; color:#94a3b8; font-size:12px; }
  iframe { border:0; border-radius:10px; background:#eef1f6; }
  pre { width:420px; max-width:100%; height:820px; margin:0; padding:14px; overflow:auto;
        border-radius:10px; background:#020617; color:#cbd5e1; font-size:12px;
        white-space:pre-wrap; box-sizing:border-box; }
"""


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else BACKEND_DIR / "email_previews"
    out_dir.mkdir(parents=True, exist_ok=True)

    sections: list[str] = []
    links: list[str] = []
    for slug, title, (subject, text_body, html_body) in build_previews():
        # Real emails attach Lucide icon PNGs as cid: inline images; a browser
        # cannot resolve cid:, so the preview file inlines them as data URIs.
        (out_dir / f"{slug}.html").write_text(html_with_data_uris(html_body), encoding="utf-8")
        (out_dir / f"{slug}.txt").write_text(text_body, encoding="utf-8")
        size_kb = len(html_body.encode("utf-8")) / 1024
        print(f"  {slug:<24} {size_kb:5.1f} KB  {subject}")

        links.append(f'<a href="#{slug}">{escape(title)}</a>')
        sections.append(
            f"""
<section id="{slug}">
  <h2>{escape(title)}</h2>
  <p class="subject">Subject: <strong>{escape(subject)}</strong> &middot; {size_kb:.1f} KB</p>
  <div class="row">
    <figure><figcaption>Desktop (640px)</figcaption>
      <iframe src="{slug}.html" width="640" height="820" title="{escape(title)} desktop"></iframe></figure>
    <figure><figcaption>Phone (375px)</figcaption>
      <iframe src="{slug}.html" width="375" height="820" title="{escape(title)} phone"></iframe></figure>
    <figure><figcaption>Plain-text fallback</figcaption>
      <pre>{escape(text_body)}</pre></figure>
  </div>
</section>"""
        )

    (out_dir / "index.html").write_text(
        f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Email previews</title><style>{GALLERY_STYLE}</style></head>
<body>
<h1>Barangay Portal email previews</h1>
<p class="lead">Rendered locally with SAMPLE data. Nothing was sent.</p>
<nav>{''.join(links)}</nav>
{''.join(sections)}
</body></html>
""",
        encoding="utf-8",
    )
    print(f"\nOpen {out_dir / 'index.html'} in a browser.")


if __name__ == "__main__":
    main()
