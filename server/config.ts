import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(10000),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  WEB_ORIGIN: z.url(),
  PLAY_TICKET_SECRET: z.string().min(32),
  RENDER_SERVICE_ID: z.string().min(1).optional(),
});

export type ServerConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  supabaseUrl: string;
  supabaseSecretKey: string;
  webOrigin: string;
  playTicketSecret: string;
  serverId: string;
};

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const result = configSchema.safeParse(environment);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid server configuration: ${issues}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    supabaseUrl: result.data.SUPABASE_URL,
    supabaseSecretKey: result.data.SUPABASE_SECRET_KEY,
    webOrigin: new URL(result.data.WEB_ORIGIN).origin,
    playTicketSecret: result.data.PLAY_TICKET_SECRET,
    serverId: result.data.RENDER_SERVICE_ID ?? "local-polymons-server",
  };
}
