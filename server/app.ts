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
  isOwnerAccount,
  isReservedUsername,
} from "./security.js";
import {
  createAuthClient,
  loadProfile,
  publicSession,
} from "./supabase.js";
import { isLoginDisabled } from "./official-account.js";
import type { PresenceSnapshot } from "./websocket.js";
import {
  friendRequestSchema,
  loginSchema,
  playerAccountLinkSchema,
  playSessionSchema,
  publishGameSchema,
  refreshSchema,
  signUpSchema,
} from "./validation.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function gameSlug(title: string, projectId: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "game";
  return `${base}-${projectId.replace(/-/g, "").slice(0, 8)}`;
}

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

async function ownerUser(
  request: Request,
  admin: SupabaseClient,
) {
  const user = await authenticatedUser(request, admin);
  if (!isOwnerAccount(user)) {
    throw new HttpError(403, "Owner access required.");
  }
  return user;
}

function integerQuery(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

export function createApp(
  config: ServerConfig,
  admin: SupabaseClient,
  presence: () => PresenceSnapshot = () => ({ counts: {}, players: [] }),
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
  app.use(express.json({ limit: "2mb" }));
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

  app.get("/v1/admin/accounts", async (request, response) => {
    await ownerUser(request, admin);
    const page = integerQuery(request.query.page, 1, 1, 10_000);
    const perPage = integerQuery(request.query.perPage, 100, 10, 200);
    const { data: authData, error: authError } =
      await admin.auth.admin.listUsers({ page, perPage });
    if (authError) throw authError;

    const userIds = authData.users.map((user) => user.id);
    const [profilesResult, gamesResult, friendshipsResult] = await Promise.all([
      userIds.length
        ? admin
            .from("profiles")
            .select("id, username, display_name, avatar_url, created_at")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from("games").select("id, owner_id, visit_count"),
      admin
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted"),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (gamesResult.error) throw gamesResult.error;
    if (friendshipsResult.error) throw friendshipsResult.error;

    const profileById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const accountStats = new Map<
      string,
      { friends: number; games: number; gameVisits: number }
    >();
    const statsFor = (userId: string) => {
      const current = accountStats.get(userId);
      if (current) return current;
      const created = { friends: 0, games: 0, gameVisits: 0 };
      accountStats.set(userId, created);
      return created;
    };

    for (const game of gamesResult.data ?? []) {
      if (!game.owner_id) continue;
      const stats = statsFor(game.owner_id);
      stats.games += 1;
      stats.gameVisits += Number(game.visit_count ?? 0);
    }
    for (const friendship of friendshipsResult.data ?? []) {
      statsFor(friendship.requester_id).friends += 1;
      statsFor(friendship.addressee_id).friends += 1;
    }

    const livePlayers = presence().players;
    const liveByUserId = new Map(
      livePlayers.map((player) => [
        player.userId,
        { gameId: player.gameId, connected: true },
      ]),
    );
    const totalVisits = (gamesResult.data ?? []).reduce(
      (total, game) => total + Number(game.visit_count ?? 0),
      0,
    );

    response.set("Cache-Control", "private, no-store");
    response.json({
      accounts: authData.users.map((authUser) => {
        const profile = profileById.get(authUser.id);
        const stats = statsFor(authUser.id);
        return {
          id: authUser.id,
          username: profile?.username ?? "unknown",
          displayName: profile?.display_name ?? "Unknown player",
          avatarUrl: profile?.avatar_url ?? null,
          joinedAt: profile?.created_at ?? authUser.created_at,
          lastSignInAt: authUser.last_sign_in_at ?? null,
          role: isOwnerAccount(authUser) ? "owner" : "player",
          loginDisabled: authUser.app_metadata?.login_disabled === true,
          passwordStatus: "protected-hash-only",
          online: liveByUserId.get(authUser.id) ?? {
            gameId: null,
            connected: false,
          },
          stats,
        };
      }),
      pagination: {
        page,
        perPage,
        total: authData.total ?? authData.users.length,
        lastPage:
          authData.lastPage ??
          Math.max(1, Math.ceil((authData.total ?? authData.users.length) / perPage)),
      },
      summary: {
        accounts: authData.total ?? authData.users.length,
        games: (gamesResult.data ?? []).length,
        gameVisits: totalVisits,
        onlinePlayers: new Set(livePlayers.map((player) => player.userId)).size,
      },
    });
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
        "id, slug, title, description, visibility, genre, thumbnail_url, platform_owned, owner_id, visit_count, updated_at",
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

    const { data: owner } = data.owner_id
      ? await admin
          .from("profiles")
          .select("username, display_name")
          .eq("id", data.owner_id)
          .maybeSingle()
      : { data: null };
    const { data: version } = await admin
      .from("game_versions")
      .select("manifest, version_number")
      .eq("game_id", data.id)
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
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
        creator: owner?.display_name ?? "Polymons",
        creatorUsername: owner?.username ?? "polymons",
        activePlayers: presence().counts[data.id] ?? 0,
        visits: Number(data.visit_count ?? 0),
        updatedAt: data.updated_at,
        manifest: version?.manifest ?? null,
        version: version?.version_number ?? null,
      },
    });
  });

  app.get("/v1/games", async (_request, response) => {
    const { data, error } = await admin
      .from("games")
      .select(
        "id, slug, title, description, genre, thumbnail_url, owner_id, visit_count, updated_at",
      )
      .eq("visibility", "public")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const ownerIds = [
      ...new Set(
        (data ?? []).flatMap((game) => (game.owner_id ? [game.owner_id] : [])),
      ),
    ];
    const { data: owners } = ownerIds.length
      ? await admin
          .from("profiles")
          .select("id, username, display_name")
          .in("id", ownerIds)
      : { data: [] };
    const ownerById = new Map((owners ?? []).map((owner) => [owner.id, owner]));
    const counts = presence().counts;
    response.json({
      games: (data ?? []).map((game) => {
        const owner = game.owner_id ? ownerById.get(game.owner_id) : null;
        return {
          id: game.id,
          slug: game.slug,
          title: game.title,
          description: game.description,
          genre: game.genre,
          thumbnailUrl: game.thumbnail_url,
          creator: owner?.display_name ?? "Polymons",
          creatorUsername: owner?.username ?? "polymons",
          activePlayers: counts[game.id] ?? 0,
          visits: Number(game.visit_count ?? 0),
          updatedAt: game.updated_at,
        };
      }),
    });
  });

  app.get("/v1/players", async (request, response) => {
    const query =
      typeof request.query.query === "string"
        ? request.query.query.trim().toLowerCase()
        : "";
    if (query.length < 1) {
      response.json({ players: [] });
      return;
    }
    if (query.length > 32 || !/^[a-z0-9_ -]+$/.test(query)) {
      throw new HttpError(400, "Enter a valid player search.");
    }
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const [usernames, displayNames] = await Promise.all([
      admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, created_at")
        .ilike("username", pattern)
        .order("username")
        .limit(12),
      admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, created_at")
        .ilike("display_name", pattern)
        .order("username")
        .limit(12),
    ]);
    if (usernames.error) throw usernames.error;
    if (displayNames.error) throw displayNames.error;
    const players = new Map(
      [...(usernames.data ?? []), ...(displayNames.data ?? [])].map((player) => [
        player.id,
        {
          id: player.id,
          username: player.username,
          displayName: player.display_name,
          avatarUrl: player.avatar_url,
          joinedAt: player.created_at,
        },
      ]),
    );
    response.json({ players: [...players.values()].slice(0, 12) });
  });

  app.get("/v1/players/:username", async (request, response) => {
    const username = request.params.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new HttpError(404, "Player not found.");
    }
    const { data: player, error: playerError } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url, created_at")
      .eq("username", username)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) throw new HttpError(404, "Player not found.");

    const [{ data: games, error: gamesError }, { count: friends, error: friendsError }] =
      await Promise.all([
        admin
          .from("games")
          .select(
            "id, slug, title, description, genre, thumbnail_url, visit_count, updated_at",
          )
          .eq("owner_id", player.id)
          .eq("visibility", "public")
          .order("updated_at", { ascending: false }),
        admin
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .eq("status", "accepted")
          .or(`requester_id.eq.${player.id},addressee_id.eq.${player.id}`),
      ]);
    if (gamesError) throw gamesError;
    if (friendsError) throw friendsError;
    const counts = presence().counts;
    const publicGames = (games ?? []).map((game) => ({
      id: game.id,
      slug: game.slug,
      title: game.title,
      description: game.description,
      genre: game.genre,
      thumbnailUrl: game.thumbnail_url,
      creator: player.display_name,
      creatorUsername: player.username,
      activePlayers: counts[game.id] ?? 0,
      visits: Number(game.visit_count ?? 0),
      updatedAt: game.updated_at,
    }));
    response.json({
      player: {
        id: player.id,
        username: player.username,
        displayName: player.display_name,
        avatarUrl: player.avatar_url,
        joinedAt: player.created_at,
      },
      stats: {
        friends: friends ?? 0,
        games: publicGames.length,
        gameVisits: publicGames.reduce((total, game) => total + game.visits, 0),
      },
      games: publicGames,
    });
  });

  app.post("/v1/games/publish", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(publishGameSchema, request.body);
    if (Buffer.byteLength(JSON.stringify(input.manifest), "utf8") > 1_500_000) {
      throw new HttpError(413, "This game is too large to publish.");
    }
    const { data: existing, error: lookupError } = await admin
      .from("games")
      .select("id, slug")
      .eq("owner_id", user.id)
      .eq("studio_project_id", input.projectId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    let game = existing;
    if (game) {
      const { data, error } = await admin
        .from("games")
        .update({
          title: input.title,
          description: input.description,
          genre: input.genre,
          visibility: "public",
        })
        .eq("id", game.id)
        .select("id, slug")
        .single();
      if (error) throw error;
      game = data;
    } else {
      const { data, error } = await admin
        .from("games")
        .insert({
          owner_id: user.id,
          studio_project_id: input.projectId,
          slug: gameSlug(input.title, input.projectId),
          title: input.title,
          description: input.description,
          genre: input.genre,
          visibility: "public",
          platform_owned: false,
        })
        .select("id, slug")
        .single();
      if (error) throw error;
      game = data;
    }
    const { data: latest } = await admin
      .from("game_versions")
      .select("version_number")
      .eq("game_id", game.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error: retireError } = await admin
      .from("game_versions")
      .update({ status: "retired" })
      .eq("game_id", game.id)
      .eq("status", "published");
    if (retireError) throw retireError;
    const versionNumber = (latest?.version_number ?? 0) + 1;
    const { error: versionError } = await admin.from("game_versions").insert({
      game_id: game.id,
      version_number: versionNumber,
      status: "published",
      manifest: input.manifest,
      created_by: user.id,
      published_at: new Date().toISOString(),
    });
    if (versionError) throw versionError;
    response.status(201).json({
      game: {
        id: game.id,
        slug: game.slug,
        title: input.title,
        version: versionNumber,
      },
    });
  });

  app.get("/v1/friends", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data, error } = await admin
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const profileIds = [
      ...new Set(
        (data ?? []).map((friendship) =>
          friendship.requester_id === user.id
            ? friendship.addressee_id
            : friendship.requester_id,
        ),
      ),
    ];
    const { data: profiles } = profileIds.length
      ? await admin
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", profileIds)
      : { data: [] };
    const profileById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    );
    const live = presence().players;
    const liveGameIds = [...new Set(live.map((player) => player.gameId))];
    const { data: liveGames } = liveGameIds.length
      ? await admin.from("games").select("id, slug").in("id", liveGameIds)
      : { data: [] };
    const gameSlugById = new Map(
      (liveGames ?? []).map((game) => [game.id, game.slug]),
    );
    response.json({
      friendships: (data ?? []).map((friendship) => {
        const profileId =
          friendship.requester_id === user.id
            ? friendship.addressee_id
            : friendship.requester_id;
        const profile = profileById.get(profileId);
        const online = live.find((player) => player.userId === profileId);
        return {
          id: friendship.id,
          status: friendship.status,
          incoming: friendship.addressee_id === user.id,
          user: profile
            ? {
                id: profile.id,
                username: profile.username,
                displayName: profile.display_name,
                avatarUrl: profile.avatar_url,
              }
            : null,
          gameId: online ? gameSlugById.get(online.gameId) ?? null : null,
        };
      }),
    });
  });

  app.post("/v1/friends/request", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(friendRequestSchema, request.body);
    const { data: addressee, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!addressee) throw new HttpError(404, "Player not found.");
    if (addressee.id === user.id) {
      throw new HttpError(400, "You cannot friend yourself.");
    }
    const { data, error } = await admin
      .from("friendships")
      .insert({
        requester_id: user.id,
        addressee_id: addressee.id,
        status: "pending",
      })
      .select("id")
      .single();
    if (error?.code === "23505") {
      throw new HttpError(409, "A friendship already exists.");
    }
    if (error) throw error;
    response.status(201).json({ friendship: { id: data.id, status: "pending" } });
  });

  app.post("/v1/friends/:friendshipId/accept", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data, error } = await admin
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", request.params.friendshipId)
      .eq("addressee_id", user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Friend request not found.");
    response.json({ friendship: { id: data.id, status: "accepted" } });
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
    const { error: visitError } = await admin.rpc("increment_game_visit", {
      target_game_id: game.id,
    });
    if (visitError) {
      console.error("Could not increment game visits:", visitError.message);
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
