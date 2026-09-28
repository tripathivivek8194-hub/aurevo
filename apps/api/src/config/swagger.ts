/**
 * Docs exposure gate (C2).
 *
 * Swagger is a full admin surface (it renders every endpoint and, even with
 * `persistAuthorization: false`, invites credential entry). It must never be
 * reachable in production. Extracted into its own predicate so the exact rule
 * is unit-tested rather than living inline inside the bootstrap that ships it.
 */
export function shouldExposeApiDocs(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}