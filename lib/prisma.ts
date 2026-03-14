import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// 1. Initialize the Postgres adapter with your connection string
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// 2. Attach PrismaClient to the `global` object in development 
// to prevent exhausting your database connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 3. Pass the adapter into the PrismaClient constructor (Required in Prisma v7)
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;