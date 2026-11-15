"""
Who is calling the API.

The app signs in with Clerk and sends the session token Clerk gives it:

    Authorization: Bearer <Clerk session JWT>

The token is signed by Clerk (RS256) and expires after about a minute, so
the server can trust the user id inside it (`sub`) without asking Clerk
on every request. The public key comes from the Clerk instance's JWKS
(cached), or from CLERK_JWT_KEY if you set it (no network needed).

Settings (in veya/.env):

    VEYA_AUTH=clerk            (default) every API request needs a valid token
    VEYA_AUTH=header           development only: trust the X-Veya-User header,
                               as before. Anyone can claim to be anyone.
    CLERK_ISSUER               optional; by default derived from
                               EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    CLERK_JWT_KEY              optional PEM public key from the Clerk dashboard
    CLERK_AUTHORIZED_PARTIES   optional comma-separated origins allowed in `azp`
                               (web origins; native apps send no azp)
"""

import base64
import logging
import os
from dataclasses import dataclass, field
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException, Request

logger = logging.getLogger(__name__)

# Clerk session tokens live 60 s; allow a little clock difference.
CLOCK_LEEWAY_SECONDS = 10
MAX_HEADER_USER_LENGTH = 128

NOT_SIGNED_IN = "Please sign in again."


class AuthConfigError(RuntimeError):
    """The server is set to require sign-in but can't verify tokens."""


def issuer_from_publishable_key(publishable_key: str) -> str:
    """
    A Clerk publishable key is "pk_test_" or "pk_live_" followed by the
    base64 of the instance's Frontend API host and a "$". That host is the
    token issuer: https://<host>.
    """

    try:
        encoded = publishable_key.split("_", 2)[2]
        host = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
    except (IndexError, ValueError, UnicodeDecodeError) as error:
        raise AuthConfigError("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key.") from error
    if not host or "." not in host:
        raise AuthConfigError("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key.")
    return f"https://{host}"


@dataclass
class ClerkVerifier:
    """Checks a Clerk session token and returns the user id in it."""

    issuer: str
    # PEM public key; if empty the key is fetched from the issuer's JWKS.
    jwt_key: str = ""
    authorized_parties: list[str] = field(default_factory=list)
    _jwks: Optional[jwt.PyJWKClient] = field(default=None, init=False, repr=False)

    def _signing_key(self, token: str):
        if self.jwt_key:
            return self.jwt_key
        if self._jwks is None:
            # Keys are cached, so Clerk is only asked when a new key appears.
            self._jwks = jwt.PyJWKClient(f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600)
        return self._jwks.get_signing_key_from_jwt(token).key

    def verify(self, token: str) -> str:
        try:
            claims = jwt.decode(
                token,
                self._signing_key(token),
                algorithms=["RS256"],
                issuer=self.issuer,
                leeway=CLOCK_LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "iss", "sub"]},
            )
        except jwt.PyJWKClientConnectionError as error:
            # Clerk's key endpoint unreachable: a server problem, not the user's.
            logger.error("Could not fetch Clerk signing keys: %s", error)
            raise HTTPException(503, "Sign-in can't be checked right now. Please try again.") from error
        except jwt.PyJWTError as error:
            logger.info("Rejected session token: %s", type(error).__name__)
            raise HTTPException(401, NOT_SIGNED_IN) from error

        authorized_party = claims.get("azp")
        if self.authorized_parties and authorized_party and authorized_party not in self.authorized_parties:
            logger.warning("Rejected session token from origin %s", authorized_party)
            raise HTTPException(401, NOT_SIGNED_IN)

        user_id = claims["sub"]
        if not isinstance(user_id, str) or not user_id:
            raise HTTPException(401, NOT_SIGNED_IN)
        return user_id


@dataclass
class Authenticator:
    """
    mode "clerk": a verified Clerk token is required.
    mode "header": development only, the X-Veya-User header is trusted.
    """

    mode: str
    verifier: Optional[ClerkVerifier] = None

    def user_for(self, request: Request) -> Optional[str]:
        if self.mode == "header":
            claimed = request.headers.get("X-Veya-User")
            if claimed and len(claimed) > MAX_HEADER_USER_LENGTH:
                raise HTTPException(422, "Invalid user.")
            return claimed or None

        scheme, _, token = request.headers.get("Authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise HTTPException(401, NOT_SIGNED_IN, headers={"WWW-Authenticate": "Bearer"})
        assert self.verifier is not None
        return self.verifier.verify(token.strip())


def authenticator_from_env() -> Authenticator:
    mode = os.getenv("VEYA_AUTH", "clerk").strip().lower()

    if mode == "header":
        logger.warning(
            "VEYA_AUTH=header: the X-Veya-User header is trusted without checking. "
            "Anyone who can reach this server can act as any user. Development only."
        )
        return Authenticator(mode="header")

    if mode != "clerk":
        raise AuthConfigError(f"VEYA_AUTH must be 'clerk' or 'header', not {mode!r}.")

    issuer = os.getenv("CLERK_ISSUER", "").strip().rstrip("/")
    if not issuer:
        publishable_key = os.getenv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "").strip()
        if not publishable_key:
            raise AuthConfigError(
                "Sign-in checks need the Clerk instance: set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY "
                "(or CLERK_ISSUER) in veya/.env. For local development without Clerk, set VEYA_AUTH=header."
            )
        issuer = issuer_from_publishable_key(publishable_key)

    parties = [origin.strip() for origin in os.getenv("CLERK_AUTHORIZED_PARTIES", "").split(",") if origin.strip()]
    jwt_key = os.getenv("CLERK_JWT_KEY", "").strip().replace("\\n", "\n")
    logger.info("Sign-in checks on: Clerk tokens from %s", issuer)
    return Authenticator(mode="clerk", verifier=ClerkVerifier(issuer=issuer, jwt_key=jwt_key, authorized_parties=parties))


def current_user(request: Request) -> Optional[str]:
    """
    FastAPI dependency: the signed-in user's id.
    A plain `def`, so FastAPI runs it in a thread (fetching keys may block).
    """

    authenticator: Authenticator = request.app.state.authenticator
    return authenticator.user_for(request)


# Use in routes:  user: CurrentUser
CurrentUser = Annotated[Optional[str], Depends(current_user)]
