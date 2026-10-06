/** Error the PM should see verbatim (validation, gate failures). */
export class UserFacingError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details: string[] = [],
  ) {
    super(message);
  }
}

export class UnauthorizedError extends Error {}
