import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prisma: PrismaClient | undefined;
}

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DATABASE_URL is not set");
}

function normalizeConnectionString(connectionString: string) {
  const url = new URL(connectionString);

  // These query params can override the explicit ssl config we pass below.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");
  url.searchParams.delete("sslrootcert");

  return url.toString();
}

const connectionString = normalizeConnectionString(rawConnectionString);

const adapter = new PrismaPg({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export const db = globalThis.__prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
