const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db');

beforeAll(async () => {
  await prisma.$connect();
  await prisma.transaction.deleteMany();
  await prisma.conversionRequest.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.transaction.deleteMany();
  await prisma.conversionRequest.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('Auth routes', () => {
  test('register returns accessToken and biometricToken', async () => {
    const email = `test+${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/register')
      .send({ email, password: 'Passw0rd!', phone: '0712345678', country: 'ZA' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('biometricToken');

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user.email).toBe(email);
  });

  test('login with correct credentials returns accessToken', async () => {
    const email = `login+${Date.now()}@example.com`;
    const password = 'StrongP@ss1';

    const reg = await request(app).post('/api/register').send({ email, password });
    expect(reg.statusCode).toBe(201);

    const res = await request(app).post('/api/login').send({ email, password });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  test('login with wrong password fails with 401', async () => {
    const email = `badpass+${Date.now()}@example.com`;
    const password = 'Correct1!';
    await request(app).post('/api/register').send({ email, password });

    const res = await request(app).post('/api/login').send({ email, password: 'wrongpass' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('register with existing email returns 409', async () => {
    const email = `dup+${Date.now()}@example.com`;
    const password = 'DupPass1!';
    const r1 = await request(app).post('/api/register').send({ email, password });
    expect(r1.statusCode).toBe(201);

    const r2 = await request(app).post('/api/register').send({ email, password });
    expect(r2.statusCode).toBe(409);
    expect(r2.body).toHaveProperty('error');
  });
});
