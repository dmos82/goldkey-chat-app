// TODO: Consider moving API base URL to environment variables
const API_BASE_URL = 'http://localhost:3001/api/auth';

interface Credentials {
  username: string;
  password: string;
}

interface AuthResponse {
  // Define expected successful response shapes
  // Example for login:
  message?: string;
  token?: string;
  userId?: string;
  username?: string;
  role?: 'admin' | 'user'; // Add role property
  // Example for register:
  // userId?: string;
  // username?: string;
}

interface AuthError {
  error: string; // Expected shape for backend error responses
}

/**
 * Attempts to register a new user.
 * @param credentials User's username and password.
 * @returns The response data on success.
 * @throws An error object { error: string } on failure.
 */
export async function registerUser(credentials: Credentials): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const data: AuthResponse | AuthError = await response.json();

    if (!response.ok) {
      // Throw the error object received from the backend, or a default one
      throw data as AuthError;
    }

    return data as AuthResponse;
  } catch (error) {
    // Log the error for debugging
    console.error('Registration API error:', error);
    // Rethrow a consistent error format if possible, or a generic error
    if (error && typeof error === 'object' && 'error' in error) {
        throw error; // Rethrow backend error object
    } else {
        throw { error: 'An unexpected error occurred during registration.' }; 
    }
  }
}

/**
 * Attempts to log in a user.
 * @param credentials User's username and password.
 * @returns The response data (including token) on success.
 * @throws An error object { error: string } on failure.
 */
export async function loginUser(credentials: Credentials): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const data: AuthResponse | AuthError = await response.json();

    if (!response.ok) {
      throw data as AuthError;
    }

    // On successful login, the backend sends back { message, token, userId, username }
    return data as AuthResponse;
  } catch (error) {
    console.error('Login API error:', error);
    if (error && typeof error === 'object' && 'error' in error) {
        throw error; 
    } else {
        throw { error: 'An unexpected error occurred during login.' };
    }
  }
} 