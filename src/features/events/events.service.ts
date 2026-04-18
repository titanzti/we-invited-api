import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface CreateEventInput {
  title: string;
  location: string;
  category: string;
  description?: string;
  imageUrl?: string;
  startdateTime?: string;
  entdateTime?: string;
  numpeople?: string;
  requiresApproval?: boolean;
  latitude?: number;
  longitude?: number;
}

const PAGE_SIZE = 15;

interface GetEventsQuery {
  category?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export class EventsService {
  static mapToPostModel(ev: any) {
    return {
      postid: ev.id,
      uid: ev.creatorId,
      name: ev.title,
      place: ev.location,
      category: ev.category,
      description: ev.description ?? "",
      image: ev.imageUrl ?? "",
      startdateTime: ev.startDate?.toISOString() ?? null,
      entdateTime: ev.endDate?.toISOString() ?? null,
      numpeople: ev.maxCapacity?.toString() ?? "",
      createdAt: ev.createdAt?.toISOString() ?? null,
      updatedAt: ev.updatedAt?.toISOString() ?? null,
      postbyname: ev.creator?.name ?? "",
      postbyimage: ev.creator?.image ?? "",
      address: ev.location,
      emailuser: ev.creator?.email ?? "",
      gender: "",
      agerange: "",
      requiresApproval: ev.requiresApproval ?? false,
      latitude: ev.latitude ?? null,
      longitude: ev.longitude ?? null,
    };
  }

  static async getEvents(query: GetEventsQuery) {
    const where: Prisma.EventWhereInput = {};
    const take = Math.min(query.limit ?? PAGE_SIZE, 50);

    if (query.category) {
      where.category = { equals: query.category, mode: "insensitive" };
    }

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { location: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        creator: { select: { name: true, image: true, email: true } },
        _count: { select: { attendees: true } },
      },
    });

    const hasMore = events.length > take;
    const page = hasMore ? events.slice(0, take) : events;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;

    return {
      data: page.map(this.mapToPostModel),
      nextCursor,
      hasMore,
    };
  }

  static async getEventById(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: { select: { name: true, image: true, email: true } },
        _count: { select: { attendees: true } },
      },
    });
    if (!event) return null;
    return this.mapToPostModel(event);
  }

  static async createEvent(data: CreateEventInput, creatorId: string) {
    const event = await prisma.event.create({
      data: {
        title: data.title,
        location: data.location,
        category: data.category,
        description: data.description,
        imageUrl: data.imageUrl,
        startDate: data.startdateTime ? new Date(data.startdateTime) : null,
        endDate: data.entdateTime ? new Date(data.entdateTime) : null,
        maxCapacity: data.numpeople ? parseInt(data.numpeople) : null,
        requiresApproval: data.requiresApproval ?? false,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        creatorId,
      },
      include: {
        creator: { select: { name: true, image: true, email: true } },
      },
    });

    return this.mapToPostModel(event);
  }

  static async joinEvent(eventId: string, userId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { _count: { select: { attendees: true } } },
    });

    if (!event) throw new Error("Event not found");
    if (event.creatorId === userId) throw new Error("You cannot join your own event");

    if (event.maxCapacity && event._count.attendees >= event.maxCapacity) {
      throw new Error("Event is full");
    }

    const existing = await prisma.joinEvent.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existing) throw new Error("Already joined");

    const status = event.requiresApproval ? "PENDING" : "APPROVED";

    const join = await prisma.joinEvent.create({
      data: { eventId, userId, status },
      include: {
        event: { select: { title: true } },
        user: { select: { name: true, image: true } },
      },
    });

    return { ...join, requiresApproval: event.requiresApproval };
  }

  static async getJoinRequests(eventId: string, ownerId: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new Error("Event not found");
    if (event.creatorId !== ownerId) throw new Error("Not the event owner");

    return prisma.joinEvent.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  }

  static async respondToJoin(joinId: string, ownerId: string, action: "approve" | "reject") {
    const join = await prisma.joinEvent.findUnique({
      where: { id: joinId },
      include: { event: true },
    });

    if (!join) throw new Error("Join request not found");
    if (join.event.creatorId !== ownerId) throw new Error("Not the event owner");
    if (join.status !== "PENDING") throw new Error("Request already processed");

    return prisma.joinEvent.update({
      where: { id: joinId },
      data: { status: action === "approve" ? "APPROVED" : "REJECTED" },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  }

  static async getMyEvents(userId: string) {
    const [created, joined] = await Promise.all([
      prisma.event.findMany({
        where: { creatorId: userId },
        orderBy: { createdAt: "desc" },
        include: {
          creator: { select: { name: true, image: true, email: true } },
        },
      }),
      prisma.joinEvent.findMany({
        where: { userId, status: "APPROVED" },
        include: {
          event: {
            include: {
              creator: { select: { name: true, image: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const createdMapped = created.map(this.mapToPostModel);
    const joinedMapped = joined.map((j) => this.mapToPostModel(j.event));

    const seen = new Set<string>();
    const merged = [];
    for (const ev of [...createdMapped, ...joinedMapped]) {
      if (!seen.has(ev.postid)) {
        seen.add(ev.postid);
        merged.push(ev);
      }
    }
    return merged;
  }

  static async updateEvent(id: string, ownerId: string, data: Partial<CreateEventInput>) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new Error("Event not found");
    if (event.creatorId !== ownerId) throw new Error("Not the event owner");

    const updated = await prisma.event.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.startdateTime !== undefined && { startDate: data.startdateTime ? new Date(data.startdateTime) : null }),
        ...(data.entdateTime !== undefined && { endDate: data.entdateTime ? new Date(data.entdateTime) : null }),
        ...(data.numpeople !== undefined && { maxCapacity: data.numpeople ? parseInt(data.numpeople) : null }),
        ...(data.requiresApproval !== undefined && { requiresApproval: data.requiresApproval }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
      },
      include: {
        creator: { select: { name: true, image: true, email: true } },
      },
    });

    return this.mapToPostModel(updated);
  }

  static async deleteEvent(id: string, ownerId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new Error("Event not found");
    if (event.creatorId !== ownerId) throw new Error("Not the event owner");
    await prisma.event.delete({ where: { id } });
  }
}
