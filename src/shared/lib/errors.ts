// Errori applicativi tipizzati. Ogni errore ha un "code" stabile (usato dal frontend)
// e uno "statusCode" HTTP. Mai includere stack trace o dettagli interni nella response.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found.`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super("FORBIDDEN", message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 422, details);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}

// Usato specificamente per lo slot appointment non più disponibile
export class AppointmentNotAvailableError extends ConflictError {
  constructor() {
    super("APPOINTMENT_NOT_AVAILABLE", "The selected time slot is no longer available.");
  }
}
