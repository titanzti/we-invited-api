import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({});

export class EventsService {

  /**
   * Retrieves the 30 most recently created events.
   * Maps Prisma Event structure to Flutter PostModel structure.
   */
  static async getRecentEvents() {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        creator: {
          select: { name: true, image: true }
        }
      }
    });

    // Map precisely to Dart `PostModel` structure expected natively
    return events.map((ev) => ({
      postid: ev.id,
      uid: ev.creatorId,
      name: ev.title,
      place: ev.location,
      category: ev.category,
      image: ev.imageUrl || "",
      // Included Creator Info natively
      postbyname: ev.creator.name,
      postbyimage: ev.creator.image || "",
      // Required Fallbacks
      address: ev.location,
      description: "Come join us for this exciting event!",
    }));
  }

  /**
   * Creates a new Event.
   */
  static async createEvent(
    data: { title: string; location: string; category: string; imageUrl?: string },
    creatorId: string
  ) {
    const event = await prisma.event.create({
      data: {
        title: data.title,
        location: data.location,
        category: data.category,
        imageUrl: data.imageUrl,
        creatorId: creatorId,
      },
    });
    return event;
  }
}
