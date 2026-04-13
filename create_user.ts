import { PrismaClient } from "@prisma/client";
import { password } from "bun";

const prisma = new PrismaClient({});

async function main() {
  const email = "admin@weinvited.com";
  const pass = "12345678";
  const hashedPassword = await password.hash(pass);
  
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashedPassword },
    create: {
      email,
      password: hashedPassword,
      name: "Admin User",
      gender: "Not Specified",
    }
  });

  console.log(`Created/Updated: ${user.email} / ${pass}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
