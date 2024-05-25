import { PrismaClient } from "@prisma/client";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("Make sure you set DATABASE_URL in your .env file");
}

const prismaClient = new PrismaClient();

export default prismaClient;
