<p align="center">
  <img src="assets/polymons-logo.png" alt="Polymons logo" width="180">
</p>

# Polymons

Polymons is a place to build games, publish them, play games made by other
people, and hang out with friends.

## Status

Polymons is in early development. The platform currently contains one internal
Baseplate game used to build and test the game client before online services
are added. Baseplate now includes a six-part block avatar, third-person camera,
character movement, jumping, collision, and pushable physics blocks.

## Platform Services

The website is hosted on GitHub Pages. Supabase provides persistent platform
data and authentication, while Render will host the session API and
authoritative game servers.

The initial Supabase schema includes:

- Profiles with unique lowercase usernames
- Friend requests and friendships
- Games and version metadata
- Server-only, one-use play sessions
- Row Level Security on every exposed table

Accounts will use a username and password without requiring a user-facing
email address. The Render API will create Supabase Auth users with a private
internal identifier, so account creation must not be called directly from the
website.

Useful database commands:

```powershell
npm run supabase:push
npm run supabase:lint
npm run supabase:advisors
```

## Polymons Server

The Render web service contains the account API, launch-ticket API, and the
first multiplayer WebSocket room. Render should use:

```text
Build Command: npm install && npm run server:build
Start Command: npm run server:start
Health Check Path: /health
```

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `WEB_ORIGIN`
- `PLAY_TICKET_SECRET`

The Supabase secret key must exist only on Render. Never add it to the website
or commit it to this repository.

Initial API routes:

- `POST /v1/accounts/signup`
- `POST /v1/accounts/login`
- `POST /v1/accounts/refresh`
- `GET /v1/me`
- `GET /v1/games/:gameId`
- `POST /v1/play-sessions`
- `WS /v1/connect?ticket=...`
