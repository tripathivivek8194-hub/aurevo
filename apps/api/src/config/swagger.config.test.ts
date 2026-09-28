import 'reflect-metadata';
import { shouldExposeApiDocs } from './swagger';

/**
 * C2 regression tests — Swagger/docs must be unreachable in production, and
 * available everywhere else (dev/test). This is the exact predicate the
 * bootstrap uses to gate the /docs route.
 */
describe('swagger config — prod exposure gate (C2)', () => {
  it('is NOT exposed in production', () => {
    expect(shouldExposeApiDocs('production')).toBe(false);
  });

  it('is exposed in development', () => {
    expect(shouldExposeApiDocs('development')).toBe(true);
  });

  it('is exposed in test', () => {
    expect(shouldExposeApiDocs('test')).toBe(true);
  });

  it('defaults to exposed when NODE_ENV is unset (safe local default)', () => {
    expect(shouldExposeApiDocs(undefined)).toBe(true);
  });

  it('is not fooled by an empty-string NODE_ENV masquerading as safe', () => {
    // An explicitly-set empty string is still treated as non-production.
    expect(shouldExposeApiDocs('')).toBe(true);
  });
});