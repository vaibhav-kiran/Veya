"""Sign-in checks: only a valid Clerk session token identifies the user."""

import base64
import hashlib
import hmac
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from tests.test_conversation_api import FIXED_ANSWERS
from webapp.auth import (
    AuthConfigError,
    Authenticator,
    ClerkVerifier,
    authenticator_from_env,
    issuer_from_publishable_key,
)

ISSUER = "https://example-app-12.clerk.accounts.dev"


def new_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


CLERK_KEY = new_key()
PUBLIC_PEM = CLERK_KEY.public_key().public_bytes(
    serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
).decode()


def token(sub="user_alice", *, key=CLERK_KEY, issuer=ISSUER, expires_in=60, algorithm="RS256", kid="test-key", **extra):
    now = int(time.time())
    claims = {"sub": sub, "iss": issuer, "iat": now, "nbf": now, "exp": now + expires_in, "sid": "sess_1", **extra}
    return jwt.encode(claims, key, algorithm=algorithm, headers={"kid": kid})


def hs256_with_public_key() -> str:
    """An attacker's token: HMAC-signed using the (public) RSA key as the secret."""
    def part(data: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")

    now = int(time.time())
    signing_input = part({"alg": "HS256", "typ": "JWT"}) + "." + part({"sub": "user_alice", "iss": ISSUER, "iat": now, "exp": now + 60})
    signature = hmac.new(PUBLIC_PEM.encode(), signing_input.encode(), hashlib.sha256).digest()
    return signing_input + "." + base64.urlsafe_b64encode(signature).decode().rstrip("=")


def bearer(value: str) -> dict:
    return {"Authorization": f"Bearer {value}"}


ALICE = bearer(token("user_alice"))
BOB = bearer(token("user_bob"))


@pytest.fixture
def clerk_client(client):
    """The test app, with real token checks instead of the X-Veya-User header."""
    client.app.state.authenticator = Authenticator(mode="clerk", verifier=ClerkVerifier(issuer=ISSUER, jwt_key=PUBLIC_PEM))
    return client


# =========================================================
# NO OR BAD TOKEN
# =========================================================


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/projects"),
        ("post", "/projects"),
        ("get", "/plan"),
        ("post", "/conversation/start"),
        ("post", "/chat/start"),
    ],
)
def test_requests_without_a_token_are_refused(clerk_client, method, path):
    response = getattr(clerk_client, method)(path)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_the_old_user_header_is_not_trusted(clerk_client):
    response = clerk_client.get("/projects", headers={"X-Veya-User": "user_alice"})

    assert response.status_code == 401


@pytest.mark.parametrize(
    "bad_token",
    [
        token(expires_in=-120),  # expired
        token(issuer="https://evil.clerk.accounts.dev"),  # another Clerk instance
        token(key=new_key()),  # signed by someone else
        "not-a-jwt",
        jwt.encode({"sub": "user_alice", "iss": ISSUER, "iat": int(time.time()), "exp": int(time.time()) + 60}, None, algorithm="none"),
        # Algorithm confusion: HS256 "signed" with the public key as the secret.
        hs256_with_public_key(),
    ],
    ids=["expired", "wrong-issuer", "wrong-key", "garbage", "alg-none", "alg-confusion"],
)
def test_invalid_tokens_are_refused(clerk_client, bad_token):
    assert clerk_client.get("/projects", headers=bearer(bad_token)).status_code == 401


def test_token_without_subject_is_refused(clerk_client):
    now = int(time.time())
    no_sub = jwt.encode({"iss": ISSUER, "iat": now, "exp": now + 60}, CLERK_KEY, algorithm="RS256")

    assert clerk_client.get("/projects", headers=bearer(no_sub)).status_code == 401


# =========================================================
# VALID TOKEN: THE USER ID COMES FROM THE TOKEN
# =========================================================


def test_projects_belong_to_the_user_in_the_token(clerk_client):
    created = clerk_client.post("/projects", json={"title": "Garden bot"}, headers=ALICE)
    assert created.status_code == 201
    project_id = created.json()["project_id"]

    assert [p["project_id"] for p in clerk_client.get("/projects", headers=ALICE).json()["projects"]] == [project_id]
    assert clerk_client.get("/projects", headers=BOB).json()["projects"] == []
    assert clerk_client.get(f"/projects/{project_id}", headers=BOB).status_code == 404
    assert clerk_client.delete(f"/projects/{project_id}", headers=BOB).status_code == 404
    assert clerk_client.get(f"/projects/{project_id}", headers=ALICE).status_code == 200


def test_header_cannot_override_the_token(clerk_client):
    clerk_client.post("/projects", json={"title": "Alice's project"}, headers=ALICE)

    # Bob's token plus a forged header claiming to be Alice.
    response = clerk_client.get("/projects", headers={**BOB, "X-Veya-User": "user_alice"})

    assert response.json()["projects"] == []


def test_conversations_can_only_be_used_by_their_owner(clerk_client):
    session_id = clerk_client.post("/conversation/start", json={}, headers=ALICE).json()["session_id"]

    # Bob is told the conversation doesn't exist, whatever he tries.
    assert clerk_client.post(f"/conversation/{session_id}/respond", data={"text": "hi"}, headers=BOB).status_code == 404
    assert clerk_client.get(f"/conversation/{session_id}", headers=BOB).status_code == 404
    assert clerk_client.post(f"/conversation/{session_id}/cancel", headers=BOB).status_code == 404
    # Without a token: not signed in.
    assert clerk_client.get(f"/conversation/{session_id}").status_code == 401

    answer = clerk_client.post(f"/conversation/{session_id}/respond", data={"text": FIXED_ANSWERS[0]}, headers=ALICE)
    assert answer.status_code == 200


def test_chats_can_only_be_used_by_their_owner(clerk_client):
    session_id = clerk_client.post("/chat/start", json={}, headers=ALICE).json()["session_id"]

    assert clerk_client.get(f"/chat/{session_id}", headers=BOB).status_code == 404
    assert clerk_client.post(f"/chat/{session_id}/cancel", headers=BOB).status_code == 404
    assert clerk_client.get(f"/chat/{session_id}", headers=ALICE).status_code == 200


def test_reply_audio_works_with_the_session_id_alone(clerk_client):
    """Web audio players can't send headers; the random session id is the key."""
    session_id = clerk_client.post("/conversation/start", json={}, headers=ALICE).json()["session_id"]

    assert clerk_client.get(f"/conversation/{session_id}/audio").status_code == 200


# =========================================================
# AUTHORIZED PARTIES (web origins)
# =========================================================


def test_authorized_parties_are_checked_when_configured():
    verifier = ClerkVerifier(issuer=ISSUER, jwt_key=PUBLIC_PEM, authorized_parties=["http://localhost:8081"])

    assert verifier.verify(token(azp="http://localhost:8081")) == "user_alice"
    # Native apps send no azp.
    assert verifier.verify(token()) == "user_alice"
    with pytest.raises(Exception) as error:
        verifier.verify(token(azp="https://evil.example"))
    assert error.value.status_code == 401


# =========================================================
# KEYS FROM CLERK'S JWKS (the default, no CLERK_JWT_KEY)
# =========================================================


def test_keys_are_fetched_from_the_issuers_jwks(monkeypatch):
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(CLERK_KEY.public_key()))
    jwk.update(kid="test-key", use="sig", alg="RS256")
    requested = []

    def fake_fetch(self):
        requested.append(self.uri)
        return {"keys": [jwk]}

    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", fake_fetch)
    verifier = ClerkVerifier(issuer=ISSUER)

    assert verifier.verify(token("user_alice")) == "user_alice"
    assert verifier.verify(token("user_bob")) == "user_bob"
    assert requested == [f"{ISSUER}/.well-known/jwks.json"]  # fetched once, then cached


def test_unreachable_jwks_is_a_server_error_not_a_sign_out(monkeypatch):
    def unreachable(self):
        raise jwt.PyJWKClientConnectionError("connection refused")

    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", unreachable)

    with pytest.raises(Exception) as error:
        ClerkVerifier(issuer=ISSUER).verify(token())
    assert error.value.status_code == 503


# =========================================================
# CONFIGURATION
# =========================================================


def publishable_key(host: str, prefix: str = "pk_test_") -> str:
    return prefix + base64.b64encode(f"{host}$".encode()).decode().rstrip("=")


def test_issuer_comes_from_the_publishable_key():
    assert issuer_from_publishable_key(publishable_key("example-app-12.clerk.accounts.dev")) == ISSUER
    assert issuer_from_publishable_key(publishable_key("clerk.veya.app", "pk_live_")) == "https://clerk.veya.app"
    with pytest.raises(AuthConfigError):
        issuer_from_publishable_key("pk_test_not-base64!")


def test_clerk_mode_is_the_default(monkeypatch):
    monkeypatch.delenv("VEYA_AUTH", raising=False)
    monkeypatch.delenv("CLERK_ISSUER", raising=False)
    monkeypatch.setenv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", publishable_key("example-app-12.clerk.accounts.dev"))

    authenticator = authenticator_from_env()

    assert authenticator.mode == "clerk"
    assert authenticator.verifier.issuer == ISSUER


def test_server_refuses_to_start_open_by_accident(monkeypatch):
    monkeypatch.delenv("VEYA_AUTH", raising=False)
    monkeypatch.delenv("CLERK_ISSUER", raising=False)
    monkeypatch.delenv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", raising=False)

    with pytest.raises(AuthConfigError):
        authenticator_from_env()

    monkeypatch.setenv("VEYA_AUTH", "none")
    with pytest.raises(AuthConfigError):
        authenticator_from_env()


def test_header_mode_must_be_chosen_explicitly(monkeypatch):
    monkeypatch.setenv("VEYA_AUTH", "header")

    assert authenticator_from_env().mode == "header"
