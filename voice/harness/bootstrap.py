"""Bootstrap a real in-progress dev interview for the harness (create + begin via the backend).

Creating an interview needs an interviewer Supabase JWT (the same auth the dashboard uses) — pass it
in ``$OVERFORGE_DEV_JWT``. Dev-mode interviews use the short duration + are clearly test data. Begin
rotates the invite token into the session token the WS handshake authenticates with.
"""

from __future__ import annotations

import httpx


def create_and_begin(
    *, api_base: str, jwt: str, candidate_email: str = "voice-e2e@acme.test"
) -> tuple[str, str]:
    """Create a dev-mode interview + begin it → (interview_id, session_token)."""
    with httpx.Client(base_url=api_base, timeout=30.0) as client:
        created = client.post(
            "/api/interviews",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"candidateEmail": candidate_email, "devMode": True},
        )
        created.raise_for_status()
        body = created.json()
        interview_id, invite_token = body["id"], body["token"]

        begun = client.post(
            f"/api/interviews/{interview_id}/begin",
            json={"token": invite_token, "tncAccepted": True},
        )
        begun.raise_for_status()
        return interview_id, begun.json()["sessionToken"]
