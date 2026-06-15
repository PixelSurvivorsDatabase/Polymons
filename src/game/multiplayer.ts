import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPantsId,
  isShirtId,
  type PantsId,
  type ShirtId,
} from "./avatarCatalog";
import {
  normalizeAvatarAppearance,
  type AvatarAppearance,
} from "./avatarAppearance";

export type PlayerTransform = {
  sequence: number;
  position: [number, number, number];
  rotationY: number;
};

export type RemotePlayer = {
  id: string;
  userId: string;
  polymonsId: number;
  username: string;
  displayName: string;
  equippedShirtId: ShirtId | null;
  equippedPantsId: PantsId | null;
  avatarAppearance: AvatarAppearance;
  state: PlayerTransform;
  leaderstats: Record<string, number | string>;
};

export type ChatMessage = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  text: string;
  sentAt: string;
};

type ServerPlayer = Omit<RemotePlayer, "state" | "avatarAppearance"> & {
  state?: PlayerTransform;
  avatarAppearance?: unknown;
};

type ServerMessage =
  | {
      type: "welcome";
      protocolVersion?: number;
      gameId: string;
      player: ServerPlayer;
      players: ServerPlayer[];
      chatMessages: ChatMessage[];
    }
  | { type: "player_joined"; player: ServerPlayer }
  | ({ type: "player_state"; playerId: string } & PlayerTransform)
  | {
      type: "player_leaderstats";
      playerId: string;
      values: Record<string, number | string>;
    }
  | { type: "player_left"; playerId: string }
  | { type: "chat_message"; message: ChatMessage }
  | { type: "chat_error"; message: string }
  | {
      type: "tix_awarded";
      amount: number;
      balance: number;
      reason: "playtime";
    }
  | { type: "pong" };

const SPAWN_STATE: PlayerTransform = {
  sequence: 0,
  position: [0, 2.7, 7],
  rotationY: 0,
};

function isTransform(value: unknown): value is PlayerTransform {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PlayerTransform>;
  return (
    Number.isInteger(state.sequence) &&
    state.sequence! >= 0 &&
    Array.isArray(state.position) &&
    state.position.length === 3 &&
    state.position.every((coordinate) => Number.isFinite(coordinate)) &&
    Number.isFinite(state.rotationY)
  );
}

function isPlayer(value: unknown): value is ServerPlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<ServerPlayer>;
  return (
    typeof player.id === "string" &&
    typeof player.userId === "string" &&
    Number.isInteger(player.polymonsId) &&
    player.polymonsId! > 0 &&
    typeof player.username === "string" &&
    typeof player.displayName === "string" &&
    (player.equippedShirtId === null ||
      isShirtId(player.equippedShirtId)) &&
    (player.equippedPantsId === null ||
      isPantsId(player.equippedPantsId)) &&
    (player.leaderstats === undefined || isLeaderstats(player.leaderstats)) &&
    (player.state === undefined || isTransform(player.state))
  );
}

function isLeaderstats(
  value: unknown,
): value is Record<string, number | string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 20 &&
    entries.every(
      ([name, stat]) =>
        name.length > 0 &&
        name.length <= 64 &&
        ((typeof stat === "number" &&
          Number.isFinite(stat) &&
          Math.abs(stat) <= 1_000_000_000_000) ||
          (typeof stat === "string" && stat.length <= 128)),
    )
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.userId === "string" &&
    typeof message.username === "string" &&
    typeof message.displayName === "string" &&
    typeof message.text === "string" &&
    message.text.length > 0 &&
    message.text.length <= 160 &&
    typeof message.sentAt === "string"
  );
}

export function parseServerMessage(value: string): ServerMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(value);
  } catch {
    return null;
  }
  if (!message || typeof message !== "object") return null;

  const candidate = message as Record<string, unknown>;
  if (candidate.type === "welcome") {
    if (
      (candidate.protocolVersion !== undefined &&
        (!Number.isInteger(candidate.protocolVersion) ||
          Number(candidate.protocolVersion) < 1)) ||
      typeof candidate.gameId !== "string" ||
      !isPlayer(candidate.player) ||
      !Array.isArray(candidate.players)
    ) {
      return null;
    }
    if (
      !candidate.players.every(isPlayer) ||
      !Array.isArray(candidate.chatMessages) ||
      !candidate.chatMessages.every(isChatMessage)
    ) {
      return null;
    }
    return candidate as ServerMessage;
  }
  if (candidate.type === "player_joined" && isPlayer(candidate.player)) {
    return candidate as ServerMessage;
  }
  if (
    candidate.type === "player_state" &&
    typeof candidate.playerId === "string" &&
    isTransform(candidate)
  ) {
    return candidate as ServerMessage;
  }
  if (
    candidate.type === "player_leaderstats" &&
    typeof candidate.playerId === "string" &&
    isLeaderstats(candidate.values)
  ) {
    return candidate as ServerMessage;
  }
  if (
    candidate.type === "chat_message" &&
    isChatMessage(candidate.message)
  ) {
    return candidate as ServerMessage;
  }
  if (
    candidate.type === "chat_error" &&
    typeof candidate.message === "string"
  ) {
    return candidate as ServerMessage;
  }
  if (
    candidate.type === "player_left" &&
    typeof candidate.playerId === "string"
  ) {
    return candidate as ServerMessage;
  }
  if (
    candidate.type === "tix_awarded" &&
    typeof candidate.amount === "number" &&
    Number.isFinite(candidate.amount) &&
    typeof candidate.balance === "number" &&
    Number.isFinite(candidate.balance) &&
    candidate.reason === "playtime"
  ) {
    return candidate as ServerMessage;
  }
  if (candidate.type === "pong") return { type: "pong" };
  return null;
}

function withState(player: ServerPlayer): RemotePlayer {
  return {
    ...player,
    avatarAppearance: normalizeAvatarAppearance(player.avatarAppearance),
    state: player.state ?? SPAWN_STATE,
    leaderstats: player.leaderstats ?? {},
  };
}

export function useMultiplayer(
  websocketUrl: string,
  expectedGameId?: string,
) {
  const socket = useRef<WebSocket | null>(null);
  const sequence = useRef(0);
  const pendingLeaderstats = useRef<Record<string, number | string>>({});
  const supportsLeaderstats = useRef(false);
  const leaderstatsTimer = useRef<number | null>(null);
  const pingStartedAt = useRef(0);
  const [connection, setConnection] = useState("Connecting");
  const [latency, setLatency] = useState<number | null>(null);
  const [tixBalance, setTixBalance] = useState<number | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayer[]>([]);
  const [localPlayer, setLocalPlayer] = useState<RemotePlayer | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState("");

  useEffect(() => {
    const nextSocket = new WebSocket(websocketUrl);
    socket.current = nextSocket;
    sequence.current = 0;
    setConnection("Connecting");
    setRemotePlayers([]);
    setLocalPlayer(null);
    setChatMessages([]);
    setChatError("");
    setLatency(null);
    setTixBalance(null);
    supportsLeaderstats.current = false;

    nextSocket.addEventListener("open", () => {
      setConnection("Connected");
      pingStartedAt.current = Date.now();
      nextSocket.send(JSON.stringify({ type: "ping" }));
    });
    nextSocket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;

      if (message.type === "welcome") {
        if (expectedGameId && message.gameId !== expectedGameId) {
          setConnection("Wrong game session");
          setRemotePlayers([]);
          setChatMessages([]);
          nextSocket.close(1008, "Game session mismatch.");
          return;
        }
        supportsLeaderstats.current = (message.protocolVersion ?? 1) >= 2;
        if (supportsLeaderstats.current) {
          nextSocket.send(
            JSON.stringify({
              type: "leaderstats",
              values: pendingLeaderstats.current,
            }),
          );
        }
        setRemotePlayers(message.players.map(withState));
        setLocalPlayer(withState(message.player));
        setChatMessages(message.chatMessages);
        return;
      }
      if (message.type === "player_joined") {
        setRemotePlayers((players) => [
          ...players.filter((player) => player.id !== message.player.id),
          withState(message.player),
        ]);
        return;
      }
      if (message.type === "player_state") {
        setRemotePlayers((players) =>
          players.map((player) =>
            player.id === message.playerId &&
            message.sequence > player.state.sequence
              ? {
                  ...player,
                  state: {
                    sequence: message.sequence,
                    position: message.position,
                    rotationY: message.rotationY,
                  },
                }
              : player,
          ),
        );
        return;
      }
      if (message.type === "player_leaderstats") {
        setRemotePlayers((players) =>
          players.map((player) =>
            player.id === message.playerId
              ? { ...player, leaderstats: message.values }
              : player,
          ),
        );
        return;
      }
      if (message.type === "player_left") {
        setRemotePlayers((players) =>
          players.filter((player) => player.id !== message.playerId),
        );
        return;
      }
      if (message.type === "chat_message") {
        setChatMessages((messages) => [...messages, message.message].slice(-50));
        setChatError("");
        return;
      }
      if (message.type === "chat_error") {
        setChatError(message.message);
        return;
      }
      if (message.type === "tix_awarded") {
        setTixBalance(message.balance);
        return;
      }
      if (message.type === "pong") {
        if (pingStartedAt.current > 0) {
          setLatency(Math.max(0, Date.now() - pingStartedAt.current));
        }
      }
    });
    nextSocket.addEventListener("close", (event) => {
      if (socket.current === nextSocket) {
        setConnection(
          event.code === 4001
            ? "Account opened in another client"
            : event.code === 1008 && event.reason === "Game session mismatch."
              ? "Wrong game session"
            : "Disconnected",
        );
      }
    });
    nextSocket.addEventListener("error", () => {
      if (socket.current === nextSocket) {
        setConnection("Connection failed");
      }
    });
    const pingTimer = window.setInterval(() => {
      if (nextSocket.readyState !== WebSocket.OPEN) return;
      pingStartedAt.current = Date.now();
      nextSocket.send(JSON.stringify({ type: "ping" }));
    }, 5_000);

    return () => {
      window.clearInterval(pingTimer);
      if (leaderstatsTimer.current !== null) {
        window.clearTimeout(leaderstatsTimer.current);
        leaderstatsTimer.current = null;
      }
      if (socket.current === nextSocket) socket.current = null;
      nextSocket.close();
    };
  }, [expectedGameId, websocketUrl]);

  const sendState = useCallback(
    (state: Omit<PlayerTransform, "sequence">) => {
      if (socket.current?.readyState !== WebSocket.OPEN) return;
      sequence.current += 1;
      socket.current.send(
        JSON.stringify({
          type: "state",
          sequence: sequence.current,
          position: state.position,
          rotationY: state.rotationY,
        }),
      );
    },
    [],
  );

  const sendChat = useCallback((text: string) => {
    const normalized = text.trim();
    if (
      !normalized ||
      normalized.length > 160 ||
      socket.current?.readyState !== WebSocket.OPEN
    ) {
      return false;
    }
    socket.current.send(JSON.stringify({ type: "chat", text: normalized }));
    return true;
  }, []);

  const sendLeaderstats = useCallback(
    (values: Record<string, number | string>) => {
      pendingLeaderstats.current = Object.fromEntries(
        Object.entries(values)
          .filter(
            ([name, value]) =>
              name.trim().length > 0 &&
              name.length <= 64 &&
              ((typeof value === "number" &&
                Number.isFinite(value) &&
                Math.abs(value) <= 1_000_000_000_000) ||
                typeof value === "string"),
          )
          .slice(0, 20)
          .map(([name, value]) => [
            name,
            typeof value === "string" ? value.slice(0, 128) : value,
          ]),
      );
      if (leaderstatsTimer.current !== null) {
        window.clearTimeout(leaderstatsTimer.current);
      }
      leaderstatsTimer.current = window.setTimeout(() => {
        leaderstatsTimer.current = null;
        if (
          !supportsLeaderstats.current ||
          socket.current?.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        socket.current.send(
          JSON.stringify({
            type: "leaderstats",
            values: pendingLeaderstats.current,
          }),
        );
      }, 150);
    },
    [],
  );

  return {
    connection,
    latency,
    tixBalance,
    remotePlayers,
    localPlayer,
    chatMessages,
    chatError,
    sendState,
    sendChat,
    sendLeaderstats,
  };
}
