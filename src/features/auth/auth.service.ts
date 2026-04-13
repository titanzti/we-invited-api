import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({});

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  gender?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  /**
   * Safe user return mapping, omitting the password field
   */
  static sanitizeUser(user: any) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  static async registerUser(data: RegisterInput) {
    const { email, password, name, gender } = data;

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error("User already exists");
    }

    // Hash the password securely via standard Bun implementation (Argon2)
    const hashedPassword = await Bun.password.hash(password);

    // Save user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        gender,
      },
    });

    return this.sanitizeUser(user);
  }

  static async loginUser(data: LoginInput) {
    const { email, password } = data;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Verify Password
    const isMatch = await Bun.password.verify(password, user.password);
    if (!isMatch) {
      throw new Error("Invalid credentials");
    }

    return this.sanitizeUser(user);
  }

  static async getUserById(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new Error("User not found");
    }
    return this.sanitizeUser(user);
  }
}
