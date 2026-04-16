import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import type { PrismaClient } from "@prisma/client";

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

export function createRsvpController(prisma: PrismaClient) {
  return new Elysia({ prefix: "/rsvp" })
    .decorate("db", prisma)
    .use(
      jwt({
        name: "jwt",
        secret: process.env.JWT_SECRET!,
      })
    )

    // POST /rsvp/:eventId - Submit RSVP for an event
    .post(
      "/:eventId",
      async ({ params, body, jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const event = await db.event.findUnique({
            where: { id: params.eventId },
          });

          if (!event) {
            set.status = 404;
            return { error: "Event not found" };
          }

          // Check if RSVP already exists
          const existing = await db.eventRSVP.findUnique({
            where: { eventId_userId: { eventId: params.eventId, userId } },
          });

          let rsvp;
          const isUpdate = !!existing;
          if (existing) {
            // Update existing RSVP
            rsvp = await db.eventRSVP.update({
              where: { id: existing.id },
              data: {
                status: body.status,
                guestCount: body.guestCount ?? 0,
                note: body.note,
              },
              include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                event: { select: { title: true, startDate: true } },
              },
            });
          } else {
            // Create new RSVP
            rsvp = await db.eventRSVP.create({
              data: {
                eventId: params.eventId,
                userId,
                status: body.status,
                guestCount: body.guestCount ?? 0,
                note: body.note,
              },
              include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                event: { select: { title: true, startDate: true } },
              },
            });
          }

          set.status = isUpdate ? 200 : 201;
          return {
            data: rsvp,
            message: isUpdate
              ? `RSVP updated to ${body.status.toLowerCase()}!`
              : `RSVP ${body.status.toLowerCase()}! ${(body.guestCount ?? 0) > 0 ? `+${body.guestCount} guests` : ''}`,
          };
        } catch (e: any) {
          set.status = 400;
          return { error: e.message || "Failed to submit RSVP" };
        }
      },
      {
        params: t.Object({ eventId: t.String() }),
        body: t.Object({
          status: t.Union([t.Literal("GOING"), t.Literal("NOT_GOING"), t.Literal("MAYBE")]),
          guestCount: t.Optional(t.Number({ minimum: 0, maximum: 10 })),
          note: t.Optional(t.String({ maxLength: 500 })),
        }),
        detail: {
          summary: "Submit or update RSVP for an event",
          tags: ["RSVP"],
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // GET /rsvp/:eventId - Get all RSVPs for an event (owner only)
    .get(
      "/:eventId",
      async ({ params, jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const event = await db.event.findUnique({
            where: { id: params.eventId },
          });

          if (!event) {
            set.status = 404;
            return { error: "Event not found" };
          }

          if (event.creatorId !== userId) {
            set.status = 403;
            return { error: "Only event owner can view RSVPs" };
          }

          const rsvps = await db.eventRSVP.findMany({
            where: { eventId: params.eventId },
            orderBy: { createdAt: "desc" },
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          });

          // Calculate stats
          const going = rsvps.filter((r) => r.status === "GOING").length;
          const maybe = rsvps.filter((r) => r.status === "MAYBE").length;
          const notGoing = rsvps.filter((r) => r.status === "NOT_GOING").length;
          const totalGuests = rsvps.reduce((sum, r) => sum + r.guestCount, 0);

          return {
            data: rsvps,
            stats: { going, maybe, notGoing, totalGuests, totalResponses: rsvps.length },
          };
        } catch (e: any) {
          set.status = 500;
          return { error: e.message || "Failed to get RSVPs" };
        }
      },
      {
        params: t.Object({ eventId: t.String() }),
        detail: {
          summary: "Get all RSVPs for an event (owner only)",
          tags: ["RSVP"],
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // GET /rsvp/my - Get my RSVPs
    .get(
      "/my",
      async ({ jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const rsvps = await db.eventRSVP.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            include: {
              event: {
                include: {
                  creator: { select: { name: true, email: true, image: true } },
                },
              },
            },
          });

          return { data: rsvps };
        } catch (e: any) {
          set.status = 500;
          return { error: e.message || "Failed to get RSVPs" };
        }
      },
      {
        detail: {
          summary: "Get my RSVPs",
          tags: ["RSVP"],
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // POST /invite/:eventId - Invite users to an event
    .post(
      "/invite/:eventId",
      async ({ params, body, jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const event = await db.event.findUnique({
            where: { id: params.eventId },
          });

          if (!event) {
            set.status = 404;
            return { error: "Event not found" };
          }

          // Check if user is the creator
          if (event.creatorId !== userId) {
            set.status = 403;
            return { error: "Only event creator can send invites" };
          }

          // Create invites for each invitee
          const invites = await Promise.all(
            body.inviteeIds.map(async (inviteeId) => {
              try {
                return await db.eventInvite.create({
                  data: {
                    eventId: params.eventId,
                    inviterId: userId,
                    inviteeId,
                  },
                  include: {
                    invitee: { select: { id: true, name: true, email: true, image: true } },
                  },
                });
              } catch (e: any) {
                if (e.code === "P2002") return null;
                throw e;
              }
            })
          );

          const createdInvites = invites.filter((i) => i !== null);

          return {
            data: createdInvites,
            message: `Invited ${createdInvites.length} user(s)`,
          };
        } catch (e: any) {
          set.status = 400;
          return { error: e.message || "Failed to send invites" };
        }
      },
      {
        params: t.Object({ eventId: t.String() }),
        body: t.Object({
          inviteeIds: t.Array(t.String()),
        }),
        detail: {
          summary: "Invite users to an event (creator only)",
          tags: ["Invites"],
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // GET /invite/my - Get my received invites
    .get(
      "/invite/my",
      async ({ jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const invites = await db.eventInvite.findMany({
            where: { inviteeId: userId },
            orderBy: { createdAt: "desc" },
            include: {
              event: {
                include: {
                  creator: { select: { name: true, email: true, image: true } },
                },
              },
              inviter: { select: { name: true, image: true } },
            },
          });

          return { data: invites };
        } catch (e: any) {
          set.status = 500;
          return { error: e.message || "Failed to get invites" };
        }
      },
      {
        detail: {
          summary: "Get my received event invites",
          tags: ["Invites"],
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // PATCH /invite/:inviteId - Accept or decline invite
    .patch(
      "/invite/:inviteId",
      async ({ params, body, jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const invite = await db.eventInvite.findUnique({
            where: { id: params.inviteId },
          });

          if (!invite) {
            set.status = 404;
            return { error: "Invite not found" };
          }

          if (invite.inviteeId !== userId) {
            set.status = 403;
            return { error: "Not your invite" };
          }

          const updated = await db.eventInvite.update({
            where: { id: params.inviteId },
            data: { status: body.action === "accept" ? "ACCEPTED" : "DECLINED" },
            include: {
              event: { select: { title: true } },
            },
          });

          return {
            data: updated,
            message: body.action === "accept" ? "Invite accepted! 🎉" : "Invite declined",
          };
        } catch (e: any) {
          set.status = 400;
          return { error: e.message || "Failed to respond to invite" };
        }
      },
      {
        params: t.Object({ inviteId: t.String() }),
        body: t.Object({
          action: t.Union([t.Literal("accept"), t.Literal("decline")]),
        }),
        detail: {
          summary: "Accept or decline event invite",
          tags: ["Invites"],
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // GET /notification-prefs - Get notification preferences
    .get(
      "/notification-prefs",
      async ({ jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const prefs = await db.notificationPrefs.findUnique({
            where: { userId },
          });

          if (!prefs) {
            // Return defaults
            return {
              data: {
                eventReminders: true,
                inviteAlerts: true,
                rsvpUpdates: true,
                eventChanges: true,
                marketingEmails: false,
              },
            };
          }

          return { data: prefs };
        } catch (e: any) {
          set.status = 500;
          return { error: e.message || "Failed to get preferences" };
        }
      },
      {
        detail: {
          summary: "Get notification preferences",
          tags: ["Notifications"],
          security: [{ BearerAuth: [] }],
        },
      }
    )

    // PATCH /notification-prefs - Update notification preferences
    .patch(
      "/notification-prefs",
      async ({ body, jwt: jwtPlugin, headers, set, db }) => {
        const userId = await verifyAuth(jwtPlugin, headers.authorization);
        if (!userId) {
          set.status = 401;
          return { error: "Invalid or missing authorization" };
        }

        try {
          const prefs = await db.notificationPrefs.upsert({
            where: { userId },
            create: { userId, ...body },
            update: body,
          });

          return { data: prefs, message: "Preferences updated!" };
        } catch (e: any) {
          set.status = 400;
          return { error: e.message || "Failed to update preferences" };
        }
      },
      {
        body: t.Object({
          eventReminders: t.Optional(t.Boolean()),
          inviteAlerts: t.Optional(t.Boolean()),
          rsvpUpdates: t.Optional(t.Boolean()),
          eventChanges: t.Optional(t.Boolean()),
          marketingEmails: t.Optional(t.Boolean()),
        }),
        detail: {
          summary: "Update notification preferences",
          tags: ["Notifications"],
          security: [{ BearerAuth: [] }],
        },
      }
    );
}
