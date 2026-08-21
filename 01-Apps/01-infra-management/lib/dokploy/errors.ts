export class DokployApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly details: string,
  ) {
    super(message);
    this.name = "DokployApiError";
  }
}
