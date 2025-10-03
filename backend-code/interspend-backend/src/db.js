const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' }
  ]
});

prisma.$on('query', (e) => {
  console.debug('Prisma Query:', e.query, e.params);
});

prisma.$on('error', (e) => {
  console.error('Prisma Error:', e);
});

module.exports = prisma;
