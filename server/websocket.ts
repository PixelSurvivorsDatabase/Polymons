import type { IncomingMessage, Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { ServerConfig } from "./config.js";
import { hashPlayTicket } from "./security.js";
import {
  loadProfile,
  type AvatarAppearance,
  type PublicProfile,
} from "./supabase.js";
import { clientMessageSchema } from "./validation.js";

type Connection = {
  id: string;
  gameId: string;
  profile: PublicProfile;
  state: PlayerState;
  leaderstats: Record<string, number | string>;
  messageCount: number;
  messageWindowStartedAt: number;
  chatMessageTimes: number[];
  lastPlaytimeRecordedAt: number;
  recordingPlaytime: boolean;
};

type PlayerState = {
  sequence: number;
  position: [number, number, number];
  rotationY: number;
};

type RoomPlayer = {
  id: string;
  userId: string;
  polymonsId: number;
  username: string;
  displayName: string;
  equippedShirtId: string | null;
  equippedPantsId: string | null;
  equippedHairId: string | null;
  equippedHatId: string | null;
  equippedShirtTextureUrl: string | null;
  equippedPantsTextureUrl: string | null;
  equippedHairModelUrl: string | null;
  equippedHairModelFormat: string | null;
  equippedHatModelUrl: string | null;
  equippedHatModelFormat: string | null;
  avatarAppearance: AvatarAppearance;
  state: PlayerState;
  leaderstats: Record<string, number | string>;
};

type RoomChatMessage = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  text: string;
  sentAt: string;
};

export type PresenceSnapshot = {
  counts: Record<string, number>;
  players: Array<{
    userId: string;
    username: string;
    displayName: string;
    gameId: string;
  }>;
  servers: Array<{
    id: string;
    gameId: string;
    playerCount: number;
    players: Array<{
      userId: string;
      username: string;
      displayName: string;
    }>;
  }>;
};

export type WebSocketController = {
  close: () => void;
  snapshot: () => PresenceSnapshot;
};

export function claimAccountConnection<T>(
  registry: Map<string, T>,
  userId: string,
  connection: T,
): T | undefined {
  const previous = registry.get(userId);
  registry.set(userId, connection);
  return previous;
}

export function releaseAccountConnection<T>(
  registry: Map<string, T>,
  userId: string,
  connection: T,
): void {
  if (registry.get(userId) === connection) {
    registry.delete(userId);
  }
}

const SPAWN_STATE: PlayerState = {
  sequence: 0,
  position: [0, 2.7, 7],
  rotationY: 0,
};

function send(socket: WebSocket, message: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sanitizeChatText(text: string): string {
  return [...text]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .trim();
}

function rejectUpgrade(socket: Duplex, status: number): void {
  socket.write(
    `HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Not Found"}\r\nConnection: close\r\n\r\n`,
  );
  socket.destroy();
}

export function attachWebSocketServer(
  server: Server,
  config: ServerConfig,
  admin: SupabaseClient,
): WebSocketController {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
  });
  const connections = new Map<WebSocket, Connection>();
  const accountConnections = new Map<string, WebSocket>();
  const rooms = new Map<string, Set<WebSocket>>();
  const roomChatHistory = new Map<string, RoomChatMessage[]>();
  const alive = new WeakMap<WebSocket, boolean>();

  const recordPlaytime = async (
    socket: WebSocket,
    connection: Connection,
  ) => {
    if (connection.recordingPlaytime) return;
    const now = Date.now();
    const elapsedSeconds = Math.min(
      600,
      Math.floor((now - connection.lastPlaytimeRecordedAt) / 1000),
    );
    if (elapsedSeconds < 1) return;
    connection.recordingPlaytime = true;
    try {
      const { data, error } = await admin.rpc("add_profile_playtime", {
        target_user_id: connection.profile.id,
        elapsed_seconds: elapsedSeconds,
      });
      if (error) throw error;
      connection.lastPlaytimeRecordedAt += elapsedSeconds * 1000;
      const reward = Array.isArray(data) ? data[0] : data;
      if (reward && Number(reward.awarded) > 0) {
        connection.profile.tix = Number(reward.balance);
        send(socket, {
          type: "tix_awarded",
          amount: Number(reward.awarded),
          balance: Number(reward.balance),
          reason: "playtime",
        });
      }
    } catch (error) {
      console.error("Could not record Tix playtime.", error);
    } finally {
      connection.recordingPlaytime = false;
    }
  };

  const broadcast = (
    gameId: string,
    message: object,
    except?: WebSocket,
  ) => {
    for (const socket of rooms.get(gameId) ?? []) {
      if (socket !== except) {
        send(socket, message);
      }
    }
  };

  const removeConnection = (socket: WebSocket, connection: Connection) => {
    if (!connections.delete(socket)) return;
    void recordPlaytime(socket, connection);
    releaseAccountConnection(
      accountConnections,
      connection.profile.id,
      socket,
    );
    const room = rooms.get(connection.gameId);
    room?.delete(socket);
    if (room?.size === 0) {
      rooms.delete(connection.gameId);
      roomChatHistory.delete(connection.gameId);
    }
    broadcast(connection.gameId, {
      type: "player_left",
      playerId: connection.id,
    });
  };

  const handleUpgrade = async (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/v1/connect") {
      rejectUpgrade(socket, 404);
      return;
    }

    const ticket = url.searchParams.get("ticket");
    if (!ticket || ticket.length > 256) {
      rejectUpgrade(socket, 401);
      return;
    }

    const now = new Date().toISOString();
    const { data: playSession, error } = await admin
      .from("play_sessions")
      .update({
        consumed_at: now,
        server_id: config.serverId,
      })
      .eq("ticket_hash", hashPlayTicket(ticket, config.playTicketSecret))
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select("id, user_id, game_id")
      .maybeSingle();

    if (error || !playSession) {
      rejectUpgrade(socket, 401);
      return;
    }

    try {
      const profile = await loadProfile(admin, playSession.user_id);
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        connections.set(webSocket, {
          id: randomUUID(),
          gameId: playSession.game_id,
          profile,
          state: { ...SPAWN_STATE },
          leaderstats: {},
          messageCount: 0,
          messageWindowStartedAt: Date.now(),
          chatMessageTimes: [],
          lastPlaytimeRecordedAt: Date.now(),
          recordingPlaytime: false,
        });
        webSocketServer.emit("connection", webSocket, request);
      });
    } catch {
      rejectUpgrade(socket, 401);
    }
  };

  server.on("upgrade", (request, socket, head) => {
    void handleUpgrade(request, socket, head).catch((error: unknown) => {
      console.error("WebSocket upgrade failed.", error);
      if (!socket.destroyed) {
        rejectUpgrade(socket, 401);
      }
    });
  });

  webSocketServer.on(
    "connection",
    (socket: WebSocket, request: IncomingMessage) => {
      void request;
      const connection = connections.get(socket);
      if (!connection) {
        socket.close(1011, "Connection state missing.");
        return;
      }

      const previousSocket = claimAccountConnection(
        accountConnections,
        connection.profile.id,
        socket,
      );
      if (previousSocket && previousSocket !== socket) {
        const previousConnection = connections.get(previousSocket);
        if (previousConnection) {
          removeConnection(previousSocket, previousConnection);
        }
        previousSocket.close(4001, "This account joined from another client.");
      }

      const room = rooms.get(connection.gameId) ?? new Set<WebSocket>();
      rooms.set(connection.gameId, room);
      const existingPlayers: RoomPlayer[] = [];
      for (const peer of room) {
        const peerConnection = connections.get(peer);
        if (peerConnection) {
          existingPlayers.push({
            id: peerConnection.id,
            userId: peerConnection.profile.id,
            polymonsId: peerConnection.profile.polymonsId,
            username: peerConnection.profile.username,
            displayName: peerConnection.profile.displayName,
            equippedShirtId: peerConnection.profile.equippedShirtId,
            equippedPantsId: peerConnection.profile.equippedPantsId,
            equippedHairId: peerConnection.profile.equippedHairId,
            equippedHatId: peerConnection.profile.equippedHatId,
            equippedShirtTextureUrl:
              peerConnection.profile.equippedShirtTextureUrl,
            equippedPantsTextureUrl:
              peerConnection.profile.equippedPantsTextureUrl,
            equippedHairModelUrl: peerConnection.profile.equippedHairModelUrl,
            equippedHairModelFormat:
              peerConnection.profile.equippedHairModelFormat,
            equippedHatModelUrl: peerConnection.profile.equippedHatModelUrl,
            equippedHatModelFormat:
              peerConnection.profile.equippedHatModelFormat,
            avatarAppearance: peerConnection.profile.avatarAppearance,
            state: peerConnection.state,
            leaderstats: peerConnection.leaderstats,
          });
        }
      }
      room.add(socket);
      alive.set(socket, true);

      const player = {
        id: connection.id,
        userId: connection.profile.id,
        polymonsId: connection.profile.polymonsId,
        username: connection.profile.username,
        displayName: connection.profile.displayName,
        equippedShirtId: connection.profile.equippedShirtId,
        equippedPantsId: connection.profile.equippedPantsId,
        equippedHairId: connection.profile.equippedHairId,
        equippedHatId: connection.profile.equippedHatId,
        equippedShirtTextureUrl: connection.profile.equippedShirtTextureUrl,
        equippedPantsTextureUrl: connection.profile.equippedPantsTextureUrl,
        equippedHairModelUrl: connection.profile.equippedHairModelUrl,
        equippedHairModelFormat: connection.profile.equippedHairModelFormat,
        equippedHatModelUrl: connection.profile.equippedHatModelUrl,
        equippedHatModelFormat: connection.profile.equippedHatModelFormat,
        avatarAppearance: connection.profile.avatarAppearance,
        state: connection.state,
        leaderstats: connection.leaderstats,
      };

      send(socket, {
        type: "welcome",
        protocolVersion: 2,
        gameId: connection.gameId,
        player,
        players: existingPlayers,
        chatMessages: roomChatHistory.get(connection.gameId) ?? [],
      });
      broadcast(
        connection.gameId,
        { type: "player_joined", player },
        socket,
      );

      socket.on("pong", () => {
        alive.set(socket, true);
      });

      socket.on("message", (raw: RawData) => {
        const currentTime = Date.now();
        if (currentTime - connection.messageWindowStartedAt >= 1_000) {
          connection.messageWindowStartedAt = currentTime;
          connection.messageCount = 0;
        }
        connection.messageCount += 1;
        if (connection.messageCount > 30) {
          socket.close(1008, "Message rate exceeded.");
          return;
        }

        let message: unknown;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          socket.close(1007, "Invalid JSON.");
          return;
        }

        const parsed = clientMessageSchema.safeParse(message);
        if (!parsed.success) {
          socket.close(1008, "Invalid message.");
          return;
        }

        if (parsed.data.type === "ping") {
          send(socket, { type: "pong", sentAt: Date.now() });
          return;
        }

        if (parsed.data.type === "chat") {
          connection.chatMessageTimes = connection.chatMessageTimes.filter(
            (sentAt) => currentTime - sentAt < 10_000,
          );
          if (connection.chatMessageTimes.length >= 8) {
            send(socket, {
              type: "chat_error",
              message: "You are sending messages too quickly.",
            });
            return;
          }
          connection.chatMessageTimes.push(currentTime);
          const chatMessage: RoomChatMessage = {
            id: randomUUID(),
            userId: connection.profile.id,
            username: connection.profile.username,
            displayName: connection.profile.displayName,
            text: sanitizeChatText(parsed.data.text),
            sentAt: new Date(currentTime).toISOString(),
          };
          if (!chatMessage.text) return;
          const history = [
            ...(roomChatHistory.get(connection.gameId) ?? []),
            chatMessage,
          ].slice(-50);
          roomChatHistory.set(connection.gameId, history);
          broadcast(connection.gameId, {
            type: "chat_message",
            message: chatMessage,
          });
          return;
        }

        if (parsed.data.type === "leaderstats") {
          connection.leaderstats = parsed.data.values;
          broadcast(
            connection.gameId,
            {
              type: "player_leaderstats",
              playerId: connection.id,
              values: connection.leaderstats,
            },
            socket,
          );
          return;
        }

        connection.state = {
          sequence: parsed.data.sequence,
          position: parsed.data.position,
          rotationY: parsed.data.rotationY,
        };
        broadcast(
          connection.gameId,
          {
            type: "player_state",
            playerId: connection.id,
            ...connection.state,
          },
          socket,
        );
      });

      socket.on("close", () => {
        removeConnection(socket, connection);
      });
    },
  );

  const keepAlive = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, 30_000);
  const playtimeRewards = setInterval(() => {
    for (const [socket, connection] of connections) {
      void recordPlaytime(socket, connection);
    }
  }, 30_000);

  return {
    snapshot: () => {
      const counts: Record<string, number> = {};
      const players: PresenceSnapshot["players"] = [];
      const serversByGame = new Map<
        string,
        PresenceSnapshot["servers"][number]
      >();
      for (const connection of connections.values()) {
        counts[connection.gameId] = (counts[connection.gameId] ?? 0) + 1;
        players.push({
          userId: connection.profile.id,
          username: connection.profile.username,
          displayName: connection.profile.displayName,
          gameId: connection.gameId,
        });
        const server =
          serversByGame.get(connection.gameId) ?? {
            id: `${config.serverId}:${connection.gameId}`,
            gameId: connection.gameId,
            playerCount: 0,
            players: [],
          };
        server.playerCount += 1;
        server.players.push({
          userId: connection.profile.id,
          username: connection.profile.username,
          displayName: connection.profile.displayName,
        });
        serversByGame.set(connection.gameId, server);
      }
      return { counts, players, servers: [...serversByGame.values()] };
    },
    close: () => {
      clearInterval(keepAlive);
      clearInterval(playtimeRewards);
      for (const socket of webSocketServer.clients) {
        socket.close(1001, "Server shutting down.");
      }
      webSocketServer.close();
    },
  };
}
