// apps/web/src/lib/config.ts
const API_BASE_URL_FROM_ENV = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL_FROM_ENV) {
  // In development, you might want a fallback, but for production builds,
  // it's better to fail fast if the essential env var is missing.
  // Throwing an error ensures visibility during the build process.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL: NEXT_PUBLIC_API_BASE_URL environment variable is not set.'
    );
  } else {
    // Provide a default for local development ONLY if absolutely necessary.
    // Consider if your local dev setup actually needs this or if it can also rely on .env.local
    console.warn(
      'WARNING: NEXT_PUBLIC_API_BASE_URL is not set. Falling back to http://localhost:3001 for local development.'
    );
    // API_BASE_URL_FROM_ENV = 'http://localhost:3001'; // Keep commented unless required
  }
}

// Ensure the final URL doesn't have a trailing slash if provided, and provide default for dev if needed
const resolvedApiBaseUrl = API_BASE_URL_FROM_ENV?.replace(/\/$/, '') || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '');

if (!resolvedApiBaseUrl && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL: API_BASE_URL could not be resolved in production environment.'
    );
}

export const API_BASE_URL = resolvedApiBaseUrl;

console.log(`[Config] Using API Base URL: ${API_BASE_URL}`); // Add log for verification

// Example usage: `${API_BASE_URL}/api/users` 