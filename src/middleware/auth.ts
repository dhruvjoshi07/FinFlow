import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'finflow_super_secret_key';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = decoded as { id: string; email: string; role: string };
      next();
    });
  } else {
    res.status(401).json({ error: 'Authorization header is missing or malformed' });
  }
}

export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.role !== role && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access forbidden: Insufficient permissions' });
    }

    next();
  };
}
