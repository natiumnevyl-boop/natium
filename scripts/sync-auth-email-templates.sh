#!/usr/bin/env bash
# Sync versioned Auth email templates to a linked Supabase project via Management API.
# Does not print tokens, API keys, or full HTML bodies.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_REF="${SUPABASE_PROJECT_REF:-ecfglnjybxyubzvfxgqu}"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  if command -v security >/dev/null 2>&1; then
    SUPABASE_ACCESS_TOKEN="$(security find-generic-password -s 'Supabase CLI' -w 2>/dev/null || true)"
  fi
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN. Run: supabase login" >&2
  exit 1
fi

read_html() {
  python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1],encoding="utf-8").read()))' "$1"
}

SUBJECTS="$ROOT/supabase/templates/subjects.json"
CONFIRM_HTML="$(read_html "$ROOT/supabase/templates/confirm-signup.html")"
RECOVERY_HTML="$(read_html "$ROOT/supabase/templates/reset-password.html")"
INVITE_HTML="$(read_html "$ROOT/supabase/templates/invite-user.html")"
CHANGE_HTML="$(read_html "$ROOT/supabase/templates/change-email.html")"
MAGIC_HTML="$(read_html "$ROOT/supabase/templates/magic-link.html")"
REAUTH_HTML="$(read_html "$ROOT/supabase/templates/reauthentication.html")"

PAYLOAD="$(SUBJECTS="$SUBJECTS" CONFIRM_HTML="$CONFIRM_HTML" RECOVERY_HTML="$RECOVERY_HTML" \
INVITE_HTML="$INVITE_HTML" CHANGE_HTML="$CHANGE_HTML" MAGIC_HTML="$MAGIC_HTML" REAUTH_HTML="$REAUTH_HTML" \
python3 <<'PY'
import json, os
subjects = json.load(open(os.environ["SUBJECTS"], encoding="utf-8"))
payload = {
  "mailer_subjects_confirmation": subjects["confirm-signup"],
  "mailer_templates_confirmation_content": json.loads(os.environ["CONFIRM_HTML"]),
  "mailer_subjects_recovery": subjects["reset-password"],
  "mailer_templates_recovery_content": json.loads(os.environ["RECOVERY_HTML"]),
  "mailer_subjects_invite": subjects["invite-user"],
  "mailer_templates_invite_content": json.loads(os.environ["INVITE_HTML"]),
  "mailer_subjects_email_change": subjects["change-email"],
  "mailer_templates_email_change_content": json.loads(os.environ["CHANGE_HTML"]),
  "mailer_subjects_magic_link": subjects["magic-link"],
  "mailer_templates_magic_link_content": json.loads(os.environ["MAGIC_HTML"]),
  "mailer_subjects_reauthentication": subjects["reauthentication"],
  "mailer_templates_reauthentication_content": json.loads(os.environ["REAUTH_HTML"]),
}
print(json.dumps(payload))
PY
)"

TMP="$(mktemp)"
HTTP_CODE="$(curl -sS -o "$TMP" -w '%{http_code}' -X PATCH "$API" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD")"

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then
  echo "Sync failed HTTP $HTTP_CODE" >&2
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print({k:d.get(k) for k in ("message","error","msg") if k in d})' "$TMP" 2>/dev/null || true
  rm -f "$TMP"
  exit 1
fi

python3 <<PY
import json
data = json.load(open("$TMP", encoding="utf-8"))
keys = [
  "mailer_subjects_confirmation",
  "mailer_subjects_recovery",
  "mailer_subjects_invite",
  "mailer_subjects_email_change",
  "mailer_subjects_magic_link",
  "mailer_subjects_reauthentication",
  "site_url",
  "mailer_autoconfirm",
  "external_email_enabled",
]
print("sync_ok", True)
print("http", "$HTTP_CODE")
for k in keys:
  if k in data:
    v = data[k]
    if isinstance(v, str) and len(v) > 120:
      v = v[:80] + "…"
    print(f"{k}={v}")
for k in (
  "mailer_templates_confirmation_content",
  "mailer_templates_recovery_content",
):
  html = data.get(k) or ""
  print(f"{k}_bytes={len(html)} has_ConfirmationURL={'{{ .ConfirmationURL }}' in html} has_NATIUM={'NATIUM' in html}")
PY
rm -f "$TMP"
