import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { PrismaClient } from "@prisma/client";
import { authController } from "./features/auth/auth.controller";
import { eventsController } from "./features/events/events.controller";
import { rsvpController } from "./features/rsvp/rsvp.controller";

// Initialize Database Connection via Prisma v7
const prisma = new PrismaClient({});

const app = new Elysia()
  // Global Middlewares
  .use(cors())
  .use(swagger({
    documentation: {
      info: {
        title: 'WeInvited API Documentation',
        version: '1.0.0',
        description: 'World-Class Database API for WeInvited Flutter App',
      }
    }
  }))
  .decorate("db", prisma) // Inject prisma safely into the context

  // Health check route
  .get("/", () => "Welcome to WeInvited API Engine 🚀")

  // Mounted Feature Plugins
  .use(authController)
  .use(eventsController)
  .use(rsvpController)

  // Future Domain Mounts will go here
  // .use(usersRouter)
  // .use(eventsRouter)

  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}\n` +
  `📖 Swagger UI is available at http://${app.server?.hostname}:${app.server?.port}/swagger`
);
