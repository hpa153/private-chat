import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { z } from "zod";

import { redis } from "@/lib/redis";
import { ROOM_TTL_SECONDS } from "@/constants";
import { authMiddleware } from "./auth";
import { Message, realtime } from "@/lib/realtime";

// Create room with fixed expiration time
const room = new Elysia({ prefix: "/room" })
  .post("/create", async () => {
    const roomId = nanoid();

    await redis.hset(`meta:${roomId}`, {
      connected: [],
      createdAt: Date.now(),
    });

    await redis.expire(`meta:${roomId}`, ROOM_TTL_SECONDS);

    return { roomId };
  })
  .use(authMiddleware)
  .get(
    "/ttl",
    async ({ auth }) => {
      const ttl = await redis.ttl(`meta:${auth.roomId}`);
      return { ttl: ttl > 0 ? ttl : 0 };
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .delete(
    "/",
    async ({ auth }) => {
      await realtime
        .channel(auth.roomId)
        .emit("chat.destroy", { isDestroyed: true });

      await Promise.all([
        redis.del(auth.roomId),
        redis.del(`meta:${auth.roomId}`),
        redis.del(`messages:${auth.roomId}`),
      ]);
    },
    { query: z.object({ roomId: z.string() }) }
  );

// Send messages
const messages = new Elysia({ prefix: "/messages" })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, auth }) => {
      const { sender, text } = body;
      const { roomId, authToken } = auth;

      const roomExists = await redis.exists(`meta:${roomId}`);

      if (!roomExists) {
        throw new Error("Room does not exist");
      }

      const message: Message = {
        id: nanoid(),
        sender,
        text,
        timestamp: Date.now(),
        roomId,
        authToken,
      };

      // Store message
      await redis.rpush(`messages:${roomId}`, { ...message, authToken });
      await realtime.channel(roomId).emit("chat.message", message);

      // Cleanup messages after TTL
      const remainingTTL = await redis.ttl(`meta:${roomId}`);

      await redis.expire(`messages:${roomId}`, remainingTTL);
      await redis.expire(`history:${roomId}`, remainingTTL);
      await redis.expire(roomId, remainingTTL);
    },
    {
      query: z.object({ roomId: z.string() }),
      body: z.object({
        sender: z.string().max(100),
        text: z.string().max(1000),
      }),
    }
  )
  .get(
    "/",
    async ({ auth }) => {
      const messages = await redis.lrange<Message>(
        `messages:${auth.roomId}`,
        0,
        -1
      );

      return {
        messages: messages.map((mess) => ({
          ...mess,
          authToken:
            mess.authToken === auth.authToken ? mess.authToken : undefined,
        })),
      };
    },
    { query: z.object({ roomId: z.string() }) }
  );

const app = new Elysia({ prefix: "/api" }).use(room).use(messages);

export type App = typeof app;
export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;
