// tests/auth.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateJWT } from '../src/app.js';

// Set the secret before any calls to authenticateJWT
process.env.JWT_SECRET = 'test_secret';

describe('authenticateJWT middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = { sendStatus: vi.fn() };
    next = vi.fn();
  });

  it('rejects missing Authorization header', () => {
    authenticateJWT(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
  });

  it('rejects invalid token', () => {
    req.headers.authorization = 'Bearer bad.token';
    authenticateJWT(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });

  it('calls next() on valid token', () => {
    const payload = { email: 'a@b.com' };
    const token = jwt.sign(payload, process.env.JWT_SECRET);
    req.headers.authorization = `Bearer ${token}`;

    authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalled();
    // Only assert on the email field, ignore 'iat'
    expect(req.user).toMatchObject({ email: payload.email });
  });
});
