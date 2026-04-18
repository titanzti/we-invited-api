import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { EventsService } from "./events.service";

async function verifyAuth(
  jwtPlugin: { verify: (token: string) => Promise<any> },
  authHeader: string | undefined
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  const payload = await jwtPlugin.verify(token);
  if (!payload || typeof payload.sub !== "string") return null;
  return payload.sub;
}

export const eventsController = new Elysia({ prefix: "/events" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "fallback_dev_secret",
    })
  )

  .get(
    "/",
    async ({ query, set }) => {
      try {
        const result = await EventsService.getEvents({
          category: query.category,
          q: query.q,
          cursor: query.cursor,
          limit: query.limit ? parseInt(query.limit) : undefined,
        });
        return { data: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore };
      } catch (e: any) {
        set.status = 500;
        return { error: e.message || "Failed to retrieve events" };
      }
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
        q: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      detail: {
        summary: "Get events feed (paginated, optional filter by category or search)",
        tags: ["Events"],
      },
    }
  )

  .get(
    "/me",
    async ({ jwt: jwtPlugin, headers, set }) => {
      const userId = await verifyAuth(jwtPlugin, headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Invalid or missing authorization" };
      }
      try {
        const events = await EventsService.getMyEvents(userId);
        return { data: events };
      } catch (e: any) {
        set.status = 500;
        return { error: e.message || "Failed to retrieve your events" };
      }
    },
    {
      detail: {
        summary: "Get my events (created + joined)",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  )

  // GET /events/:id — fetch a single event by ID
  .get(
    "/:id",
    async ({ params, set }) => {
      try {
        const event = await EventsService.getEventById(params.id);
        if (!event) {
          set.status = 404;
          return { error: "Event not found" };
        }
        return { data: event };
      } catch (e: any) {
        set.status = 500;
        return { error: e.message || "Failed to retrieve event" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get a single event by ID",
        tags: ["Events"],
      },
    }
  )

  .post(
    "/",
    async ({ body, jwt: jwtPlugin, headers, set }) => {
      const userId = await verifyAuth(jwtPlugin, headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Invalid or missing authorization" };
      }
      try {
        const newEvent = await EventsService.createEvent(body, userId);
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
        description: t.Optional(t.String()),
        imageUrl: t.Optional(t.String()),
        startdateTime: t.Optional(t.String()),
        entdateTime: t.Optional(t.String()),
        numpeople: t.Optional(t.String()),
        requiresApproval: t.Optional(t.Boolean()),
        latitude: t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
      }),
      detail: {
        summary: "Create a new event",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  )

  // PATCH /events/:id — owner-only update
  .patch(
    "/:id",
    async ({ params, body, jwt: jwtPlugin, headers, set }) => {
      const userId = await verifyAuth(jwtPlugin, headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Invalid or missing authorization" };
      }
      try {
        const updated = await EventsService.updateEvent(params.id, userId, body);
        return { data: updated };
      } catch (e: any) {
        const msg = e.message || "Failed to update event";
        if (msg.includes("owner")) set.status = 403;
        else if (msg.includes("not found")) set.status = 404;
        else set.status = 400;
        return { error: msg };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String()),
        location: t.Optional(t.String()),
        category: t.Optional(t.String()),
        description: t.Optional(t.String()),
        imageUrl: t.Optional(t.String()),
        startdateTime: t.Optional(t.String()),
        entdateTime: t.Optional(t.String()),
        numpeople: t.Optional(t.String()),
        requiresApproval: t.Optional(t.Boolean()),
        latitude: t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
      }),
      detail: {
        summary: "Update an event (owner only)",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  )

  // DELETE /events/:id — owner-only delete
  .delete(
    "/:id",
    async ({ params, jwt: jwtPlugin, headers, set }) => {
      const userId = await verifyAuth(jwtPlugin, headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Invalid or missing authorization" };
      }
      try {
        await EventsService.deleteEvent(params.id, userId);
        set.status = 204;
        return {};
      } catch (e: any) {
        const msg = e.message || "Failed to delete event";
        if (msg.includes("owner")) set.status = 403;
        else if (msg.includes("not found")) set.status = 404;
        else set.status = 400;
        return { error: msg };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete an event (owner only)",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  )

  .post(
    "/:id/join",
    async ({ params, jwt: jwtPlugin, headers, set }) => {
      const userId = await verifyAuth(jwtPlugin, headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Invalid or missing authorization" };
      }
      try {
        const join = await EventsService.joinEvent(params.id, userId);
        const msg = join.requiresApproval
          ? "Request sent — waiting for approval"
          : "Joined successfully";
        return { data: join, message: msg };
      } catch (e: any) {
        const msg = e.message || "Failed to join event";
        if (msg.includes("not found")) set.status = 404;
        else if (msg.includes("Already") || msg.includes("own event") || msg.includes("full"))
          set.status = 409;
        else set.status = 400;
        return { error: msg };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Join an event (auto-approved or pending based on event settings)",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  )

  // GET /events/:id/requests — owner only: list join requests
  .get(
    "/:id/requests",
    async ({ params, jwt: jwtPlugin, headers, set }) => {
      const userId = await verifyAuth(jwtPlugin, headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Invalid or missing authorization" };
      }
      try {
        const requests = await EventsService.getJoinRequests(params.id, userId);
        return { data: requests };
      } catch (e: any) {
        const msg = e.message || "Failed to get requests";
        set.status = msg.includes("owner") ? 403 : 400;
        return { error: msg };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get join requests for an event (owner only)",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  )

  // PATCH /events/:id/requests/:joinId — owner: approve/reject
  .patch(
    "/:id/requests/:joinId",
    async ({ params, body, jwt: jwtPlugin, headers, set }) => {
      const userId = await verifyAuth(jwtPlugin, headers.authorization);
      if (!userId) {
        set.status = 401;
        return { error: "Invalid or missing authorization" };
      }
      try {
        const result = await EventsService.respondToJoin(params.joinId, userId, body.action);
        return {
          data: result,
          message: `Request ${body.action}d successfully`,
        };
      } catch (e: any) {
        const msg = e.message || "Failed to process request";
        if (msg.includes("owner")) set.status = 403;
        else if (msg.includes("not found")) set.status = 404;
        else if (msg.includes("already")) set.status = 409;
        else set.status = 400;
        return { error: msg };
      }
    },
    {
      params: t.Object({ id: t.String(), joinId: t.String() }),
      body: t.Object({
        action: t.Union([t.Literal("approve"), t.Literal("reject")]),
      }),
      detail: {
        summary: "Approve or reject a join request (owner only)",
        tags: ["Events"],
        security: [{ BearerAuth: [] }],
      },
    }
  );
