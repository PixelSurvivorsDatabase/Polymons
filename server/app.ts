import type { SupabaseClient } from "@supabase/supabase-js";
import cors from "cors";
import express, { type Request } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { ServerConfig } from "./config.js";
import {
  bearerToken,
  errorHandler,
  HttpError,
  notFound,
  parseBody,
} from "./http.js";
import {
  createPlayerAccountTicket,
  createPlayTicket,
  hashPlayerAccountTicket,
  hashPlayTicket,
  internalEmailForUsername,
  isReservedUsername,
} from "./security.js";
import {
  createAuthClient,
  loadProfile,
  publicSession,
} from "./supabase.js";
import { isLoginDisabled } from "./official-account.js";
import {
  loginSchema,
  playerAccountLinkSchema,
  playSessionSchema,
  refreshSchema,
  signUpSchema,
} from "./validation.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function websocketUrl(request: Request, ticket: string): string {
  const forwardedProtocol = request.get("x-forwarded-proto");
  const secure = forwardedProtocol === "https" || request.protocol === "https";
  const protocol = secure ? "wss" : "ws";
  return `${protocol}://${request.get("host")}/v1/connect?ticket=${encodeURIComponent(ticket)}`;
}

async function authenticatedUser(
  request: Request,
  admin: SupabaseClient,
) {
  const token = bearerToken(request);
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError(401, "Invalid or expired session.");
  }

  if (isLoginDisabled(data.user)) {
    throw new HttpError(401, "Invalid or expired session.");
  }

  return data.user;
}

export function createApp(
  config: ServerConfig,
  admin: SupabaseClient,
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.webOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  const accountLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.get("/", (_request, response) => {
    response.json({
      name: "Polymons Server",
      status: "online",
      protocolVersion: 1,
    });
  });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/v1/accounts/signup", accountLimiter, async (request, response) => {
    const input = parseBody(signUpSchema, request.body);
    if (isReservedUsername(input.username)) {
      throw new HttpError(409, "That username is unavailable.");
    }

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .maybeSingle();

    if (profileLookupError) {
      throw profileLookupError;
    }
    if (existingProfile) {
      throw new HttpError(409, "That username is unavailable.");
    }

    const email = internalEmailForUsername(input.username);
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          username: input.username,
          display_name: input.displayName ?? input.username,
        },
      });

    if (createError || !created.user) {
      const message = createError?.message.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("database")) {
        throw new HttpError(409, "That username is unavailable.");
      }
      throw new HttpError(400, "Could not create account.");
    }

    const auth = createAuthClient(config);
    const { data: signedIn, error: signInError } =
      await auth.auth.signInWithPassword({
        email,
        password: input.password,
      });

    if (signInError || !signedIn.session) {
      throw new HttpError(500, "Account created, but sign-in failed.");
    }

    const profile = await loadProfile(admin, created.user.id);
    response.status(201).json({
      user: profile,
      session: publicSession(signedIn.session),
    });
  });

  app.post("/v1/accounts/login", accountLimiter, async (request, response) => {
    const input = parseBody(loginSchema, request.body);
    if (isReservedUsername(input.username)) {
      throw new HttpError(401, "Invalid username or password.");
    }

    const auth = createAuthClient(config);
    const { data, error } = await auth.auth.signInWithPassword({
      email: internalEmailForUsername(input.username),
      password: input.password,
    });

    if (error || !data.user || !data.session) {
      throw new HttpError(401, "Invalid username or password.");
    }

    const profile = await loadProfile(admin, data.user.id);
    response.json({
      user: profile,
      session: publicSession(data.session),
    });
  });

  app.post("/v1/accounts/refresh", accountLimiter, async (request, response) => {
    const input = parseBody(refreshSchema, request.body);
    const auth = createAuthClient(config);
    const { data, error } = await auth.auth.refreshSession({
      refresh_token: input.refreshToken,
    });

    if (error || !data.user || !data.session) {
      throw new HttpError(401, "Invalid or expired refresh token.");
    }

    const profile = await loadProfile(admin, data.user.id);
    response.json({
      user: profile,
      session: publicSession(data.session),
    });
  });

  app.get("/v1/me", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    response.json({ user: await loadProfile(admin, user.id) });
  });

  app.post("/v1/player-account-links", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const ticket = createPlayerAccountTicket();
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    const { error } = await admin.from("player_account_links").insert({
      user_id: user.id,
      ticket_hash: hashPlayerAccountTicket(
        ticket,
        config.playTicketSecret,
      ),
      expires_at: expiresAt,
    });

    if (error) throw error;
    response.set("Cache-Control", "no-store");
    response.status(201).json({
      playerAccountLink: { ticket, expiresAt },
    });
  });

  app.post(
    "/v1/player-account-links/redeem",
    accountLimiter,
    async (request, response) => {
      const input = parseBody(playerAccountLinkSchema, request.body);
      const now = new Date().toISOString();
      const { data: link, error: linkError } = await admin
        .from("player_account_links")
        .update({ consumed_at: now })
        .eq(
          "ticket_hash",
          hashPlayerAccountTicket(input.ticket, config.playTicketSecret),
        )
        .is("consumed_at", null)
        .gt("expires_at", now)
        .select("user_id")
        .maybeSingle();

      if (linkError) throw linkError;
      if (!link) {
        throw new HttpError(401, "That Player link is invalid or expired.");
      }

      const { data: account, error: accountError } =
        await admin.auth.admin.getUserById(link.user_id);
      if (
        accountError ||
        !account.user?.email ||
        isLoginDisabled(account.user)
      ) {
        throw new HttpError(401, "That Player link cannot be used.");
      }

      const { data: generated, error: generateError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: account.user.email,
        });
      if (generateError || !generated.properties.hashed_token) {
        throw new HttpError(500, "Could not connect the Player account.");
      }

      const auth = createAuthClient(config);
      const { data: verified, error: verifyError } =
        await auth.auth.verifyOtp({
          token_hash: generated.properties.hashed_token,
          type: "email",
        });
      if (verifyError || !verified.user || !verified.session) {
        throw new HttpError(500, "Could not connect the Player account.");
      }

      response.set("Cache-Control", "no-store");
      response.json({
        user: await loadProfile(admin, verified.user.id),
        session: publicSession(verified.session),
      });
    },
  );

  app.get("/v1/games/:gameId", async (request, response) => {
    const gameId = request.params.gameId;
    let query = admin
      .from("games")
      .select(
        "id, slug, title, description, visibility, genre, thumbnail_url, platform_owned, updated_at",
      )
      .eq("visibility", "public");

    query = UUID_PATTERN.test(gameId)
      ? query.eq("id", gameId)
      : query.eq("slug", gameId);

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      throw new HttpError(404, "Game not found.");
    }

    response.json({
      game: {
        id: data.id,
        slug: data.slug,
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        genre: data.genre,
        thumbnailUrl: data.thumbnail_url,
        platformOwned: data.platform_owned,
        updatedAt: data.updated_at,
      },
    });
  });

  app.post("/v1/play-sessions", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(playSessionSchema, request.body);

    let gameQuery = admin
      .from("games")
      .select("id, slug, title")
      .eq("visibility", "public");

    gameQuery = UUID_PATTERN.test(input.gameId)
      ? gameQuery.eq("id", input.gameId)
      : gameQuery.eq("slug", input.gameId);

    const { data: game, error: gameError } = await gameQuery.maybeSingle();
    if (gameError) {
      throw gameError;
    }
    if (!game) {
      throw new HttpError(404, "Game not found.");
    }

    const { data: version } = await admin
      .from("game_versions")
      .select("id")
      .eq("game_id", game.id)
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ticket = createPlayTicket();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const { data: playSession, error: sessionError } = await admin
      .from("play_sessions")
      .insert({
        user_id: user.id,
        game_id: game.id,
        game_version_id: version?.id ?? null,
        ticket_hash: hashPlayTicket(ticket, config.playTicketSecret),
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (sessionError || !playSession) {
      throw sessionError ?? new Error("Could not create play session.");
    }

    response.status(201).json({
      playSession: {
        id: playSession.id,
        game,
        expiresAt,
        ticket,
        websocketUrl: websocketUrl(request, ticket),
      },
    });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
