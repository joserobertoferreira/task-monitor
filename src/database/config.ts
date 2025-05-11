import { env } from './env';
import { PrismaClient } from './prisma/client';

const buildDatabaseUrl = (): string => {
  const server = env.DB_SERVER;
  const user = env.DB_USERNAME;
  const password = env.DB_PASSWORD;
  const dbName = env.DB_DATABASE;
  const encrypt = false;
  const trustServerCertificate = true;

  if (!server || !user || !password || !dbName) {
    console.error('FATAL ERROR: Missing database connection details in environment variables.');
    process.exit(1);
  }

  // SQL Server connection string format
  // "sqlserver://USER:PASSWORD@server:PORT;database=DB_DATABASE;encrypt=true;trustServerCertificate=true"
  const encodedPassword = encodeURIComponent(password);

  return `sqlserver://${server};database=${dbName};user=${user};password=${encodedPassword};encrypt=${encrypt};trustServerCertificate=${trustServerCertificate}`;
};

const DATABASE_URL_RUNTIME = buildDatabaseUrl();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL_RUNTIME,
    },
  },
});

export default prisma;
