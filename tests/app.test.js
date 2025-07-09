// tests/app.test.js

// 1) Set the secret before importing app
process.env.JWT_SECRET = 'test_secret';

import request from 'supertest';
import app from '../src/app.js';

describe('User Service API', () => {
  let token;

  beforeAll(async () => {
    // register
    await request(app)
      .post('/register')
      .send({ email: 'test@example.com', password: 'password' })
      .expect(201);

    // login
    const loginRes = await request(app)
      .post('/login')
      .send({ email: 'test@example.com', password: 'password' })
      .expect(200);

       const { accessToken, refreshToken } = loginRes.body;
       expect(typeof accessToken).toBe('string');
        expect(typeof refreshToken).toBe('string');
       token = accessToken;
  });

  it('GET /profile with token → 200 + correct body', async () => {
    const res = await request(app)
      .get('/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ email: 'test@example.com' });
  });

  it('GET /profile without token → 401', async () => {
    await request(app)
      .get('/profile')
      .expect(401);
  });

  it('GET /query with token → 200 + JSON', async () => {
    await request(app)
      .get('/query')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/);
  });

  it('GET /query without token → 401', async () => {
    await request(app)
      .get('/query')
      .expect(401);
  });
});
