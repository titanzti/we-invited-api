import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { EventsService } from "./events.service";

export const eventsController = new Elysia({ prefix: "/events" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "fallback_dev_secret",
    })
  )
  /**
   * @Events
   * Returns recent posts/events for the global feed
   */
  .get(
    "/",
    async ({ set }) => {
      try {
        const posts = await EventsService.getRecentEvents();
        return { data: posts };
      } catch (e: any) {
        set.status = 500;
        return { error: e.message || "Failed to retrieve events" };
      }
    },
    {
      detail: {
        summary: "Get global feed events",
        tags: ["Events"],
      },
    }
  )

  /**
   * @CreateEvent
   * Protected Route creating a new event
   */
  .post(
    "/",
    async ({ body, jwt, headers, set }) => {
      // Validate Authorization header
      const authHeader = headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { error: "Missing or invalid authorization header" };
      }

      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      if (!payload || !payload.sub) {
        set.status = 401;
        return { error: "Invalid token" };
      }

      try {
        const creatorId = payload.sub as string;
        const newEvent = await EventsService.createEvent(body, creatorId);
        
        set.status = 201;
        return { data: newEvent };
      } catch (e: any) {
        set.status = 400;
        return { error: e.message || "Failed to create event" };
      }
    },
    {
      body: t.Object({
        title: t.String({ minLength: 3 }),
        location: t.String({ minLength: 3 }),
        category: t.String(),
        imageUrl: t.Optional(t.String()),
      }),
      detail: {
        summary: "Create a new event",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  );
