import { useCallback, useEffect, useRef, useState } from "react";

export type PlayerTransform = {
  sequence: number;
  position: [number, number, number];
  rotationY: number;
};

export type RemotePlayer = {
  id: string;
  username: string;
  displayName: string;
  state: PlayerTransform;
};

type ServerPlayer = Omit<RemotePlayer, "state"> & {
  state?: PlayerTransform;
};

type ServerMessage =
  | {
      type: "welcome";
      player: ServerPlayer;
      players: ServerPlayer[];
    }
  | { type: "player_joined"; player: ServerPlayer }
  | ({ type: "player_state"; playerId: string } & PlayerTransform)
  | { type: "player_left"; playerId: string }
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
    typeof player.username === "string" &&
    typeof player.displayName === "string" &&
    (player.state === undefined || isTransform(player.state))
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
    if (!isPlayer(candidate.player) || !Array.isArray(candidate.players)) {
      return null;
    }
    if (!candidate.players.every(isPlayer)) return null;
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
    candidate.type === "player_left" &&
    typeof candidate.playerId === "string"
  ) {
    return candidate as ServerMessage;
  }
  if (candidate.type === "pong") return { type: "pong" };
  return null;
}

function withState(player: ServerPlayer): RemotePlayer {
  return {
    ...player,
    state: player.state ?? SPAWN_STATE,
  };
}

export function useMultiplayer(websocketUrl: string) {
  const socket = useRef<WebSocket | null>(null);
  const sequence = useRef(0);
  const [connection, setConnection] = useState("Connecting");
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayer[]>([]);

  useEffect(() => {
    const nextSocket = new WebSocket(websocketUrl);
    socket.current = nextSocket;
    sequence.current = 0;
    setConnection("Connecting");
    setRemotePlayers([]);

    nextSocket.addEventListener("open", () => {
      setConnection("Connected");
      nextSocket.send(JSON.stringify({ type: "ping" }));
    });
    nextSocket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;

      if (message.type === "welcome") {
        setRemotePlayers(message.players.map(withState));
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
      if (message.type === "player_left") {
        setRemotePlayers((players) =>
          players.filter((player) => player.id !== message.playerId),
        );
      }
    });
    nextSocket.addEventListener("close", () => {
      if (socket.current === nextSocket) {
        setConnection("Disconnected");
      }
    });
    nextSocket.addEventListener("error", () => {
      if (socket.current === nextSocket) {
        setConnection("Connection failed");
      }
    });

    return () => {
      if (socket.current === nextSocket) socket.current = null;
      nextSocket.close();
    };
  }, [websocketUrl]);

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

  return { connection, remotePlayers, sendState };
}
