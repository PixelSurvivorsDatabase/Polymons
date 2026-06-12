const CHAT_USERNAME_COLORS = [
  "#ff7b72",
  "#79c0ff",
  "#a5d6ff",
  "#d2a8ff",
  "#7ee787",
  "#ffa657",
  "#f2cc60",
  "#ff9bce",
];

export function chatUsernameColor(accountId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < accountId.length; index += 1) {
    hash ^= accountId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return CHAT_USERNAME_COLORS[Math.abs(hash) % CHAT_USERNAME_COLORS.length];
}
