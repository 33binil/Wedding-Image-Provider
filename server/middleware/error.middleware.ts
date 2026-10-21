import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod schema validation errors
  if (err instanceof ZodError) {
    const issues = err.issues || (err as any).errors || [];
    const formattedErrors = issues.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: issues[0]?.message || 'Input validation failed',
      errors: formattedErrors,
    });
    return;
  }

  // MongoDB duplicate key error (e.g. unique email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    res.status(409).json({
      success: false,
      error: 'DUPLICATE_RESOURCE',
      message: `An account with this ${field} already exists.`,
    });
    return;
  }

  // Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: 'INVALID_ID',
      message: 'The requested resource identifier is malformed.',
    });
    return;
  }

  // Mongoose Validation error
  if (err.name === 'ValidationError') {
    const firstMessage = Object.values(err.errors)[0] as any;
    res.status(400).json({
      success: false,
      error: 'DATABASE_VALIDATION_ERROR',
      message: firstMessage?.message || 'Database validation failed',
    });
    return;
  }

  // Database offline / connection errors handling
  if (
    err.name === 'MongooseError' ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError' ||
    (typeof err.message === 'string' &&
      (err.message.includes('buffering timed out') || err.message.includes('ECONNREFUSED')))
  ) {
    console.warn('[AI Studio] Database offline — returning graceful fallback');
    if (_req.method === 'GET') {
      const isPlural = _req.path.endsWith('s') || _req.path.endsWith('s/');
      res.status(200).json({
        success: true,
        data: isPlural ? [] : null,
        offline: true,
        message: 'Database is currently offline',
      });
      return;
    }
    res.status(503).json({
      success: false,
      error: 'DATABASE_OFFLINE',
      message: 'Service temporarily unavailable (database offline)',
    });
    return;
  }

  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred. Please try again.',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `API route ${req.method} ${req.originalUrl} not found`,
  });
}
