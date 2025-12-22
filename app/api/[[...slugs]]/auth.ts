import Elysia from "elysia";

import { redis } from "@/lib/redis";

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export const authMiddleware = new Elysia({
  name: "auth",
})
  .error({ AuthError })
  .onError(({ code, set }) => {
    if (code === "AuthError") {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })
  .derive({ as: "scoped" }, async ({ query, cookie }) => {
    const roomId = query.roomId;
    const authToken = cookie["x-auth-token"].value as string;

    if (!roomId || !authToken) {
      throw new AuthError("Missing roomId or authToken");
    }
    const connected = await redis.hget<string[]>(`meta:${roomId}`, "connected");

    if (!connected?.includes(authToken)) {
      throw new AuthError("Invalid authToken for this room");
    }

    return { auth: { roomId, authToken, connected } };
  });
