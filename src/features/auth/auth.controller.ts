import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { AuthService } from "./auth.service";

export const authController = new Elysia({ prefix: "/auth" })
  // Inject JWT plugin pointing to our secure env secret
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "fallback_dev_secret",
      exp: "7d", // Expires in 7 days
    })
  )

  /**
   * @Register
   * Validates Request Body fully using Elysia's `t` schema system (TypeBox)
   */
  .post(
    "/register",
    async ({ body, jwt, set }) => {
      try {
        const user = await AuthService.registerUser(body);

        // Sign JWT token using the generated distinct UUID
        const token = await jwt.sign({ sub: user.id });

        return {
          message: "Registration successful",
          token,
          user,
        };
      } catch (e: any) {
        set.status = 400;
        return { error: e.message || "Failed to register" };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        name: t.String(),
        gender: t.Optional(t.String()),
      }),
      detail: {
        summary: "Register new user",
        tags: ["Authentication"],
      },
    }
  )

  /**
   * @Login
   */
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      try {
        const user = await AuthService.loginUser(body);
        const token = await jwt.sign({ sub: user.id });

        return {
          message: "Login successful",
          token,
          user,
        };
      } catch (e: any) {
        set.status = 401;
        return { error: e.message || "Unauthorized" };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
      }),
      detail: {
        summary: "Login user",
        tags: ["Authentication"],
      },
    }
  )

  /**
   * @Me
   * Protected Route returning current user profile
   */
  .get(
    "/me",
    async ({ jwt, headers, set }) => {
      // Extract Bearer token
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
        // sub is the user ID casted to string
        const user = await AuthService.getUserById(payload.sub as string);
        return { user };
      } catch (e: any) {
        set.status = 404;
        return { error: "User profile not found" };
      }
    },
    {
      detail: {
        summary: "Get current user profile",
        tags: ["Authentication"],
        security: [{ BearerAuth: [] }],
      },
    }
  );
