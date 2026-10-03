import { supabase } from './supabase';

export const RESERVED_USERNAMES = new Set([
  'admin',
  'nemora',
  'support',
  'root',
  'system',
  'api',
  'auth',
  'help',
  'moderator',
  'superuser',
  'contact',
  'team',
  'owner',
]);

// Top 100 most common compromised passwords
export const COMMON_PASSWORDS = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111',
  '1234567', 'dragon', 'welcome', 'admin', 'football', 'monkey', 'login', 'princess',
  'solo', 'starwars', 'orange', 'sunshine', 'shadow', 'master', 'trustno1', 'iloveyou',
  'charlie', 'alexander', 'mustang', 'secret', 'superman', 'michael', 'passcode',
  'database', 'system123', 'nemora123', 'freedom', 'computer', 'baseball', 'internet',
  '000000', '123123', '654321', '666666', '7777777', '888888', '987654321', 'apple',
  'batman', 'cookie', 'killer', 'liverpool', 'matrix', 'pepper', 'police', 'robert',
  'scooter', 'server', 'single', 'soccer', 'spider', 'summer', 'thunder', 'vampire',
  'whatever', 'wizard', 'yellow', 'zxcvbnm', 'guest', 'test', 'tester', 'student',
  'engineer', 'developer', 'hacker', 'creative', 'design', 'future', 'green123',
  'energy', 'carbon', 'nature', 'planet', 'forest', 'ecosystem', 'climate', 'earth'
]);

export interface UsernameValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUsernameFormat(username: string): UsernameValidationResult {
  const clean = username.trim().toLowerCase();

  if (!clean) {
    return { valid: false, error: 'Username is required' };
  }

  if (clean.length < 3) {
    return { valid: false, error: 'Must be at least 3 characters' };
  }

  if (clean.length > 20) {
    return { valid: false, error: 'Cannot exceed 20 characters' };
  }

  if (!/^[a-z0-9_]+$/.test(clean)) {
    return { valid: false, error: 'Only lowercase letters, numbers, and underscores allowed' };
  }

  if (RESERVED_USERNAMES.has(clean)) {
    return { valid: false, error: 'This username is reserved' };
  }

  return { valid: true };
}

export async function checkUsernameAvailability(username: string): Promise<boolean> {
  const formatResult = validateUsernameFormat(username);
  if (!formatResult.valid) return false;

  try {
    const { data, error } = await supabase.rpc('is_username_available', {
      p_username: username.trim().toLowerCase(),
    });

    if (error) {
      console.warn('Username availability check error:', error.message);
      return true; // Fallback to allowing submit so server trigger can validate
    }

    return Boolean(data);
  } catch (err) {
    console.warn('Username availability check exception:', err);
    return true;
  }
}

export interface PasswordStrengthResult {
  score: number; // 0 to 4
  label: 'Too Short' | 'Common' | 'Weak' | 'Fair' | 'Strong';
  color: string;
  isAcceptable: boolean;
  error?: string;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { score: 0, label: 'Too Short', color: '#888888', isAcceptable: false, error: 'Password is required' };
  }

  if (password.length < 8) {
    return { score: 0, label: 'Too Short', color: '#FF4466', isAcceptable: false, error: 'Must be at least 8 characters' };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { score: 1, label: 'Common', color: '#FF4466', isAcceptable: false, error: 'Password is too common and easily guessed' };
  }

  let score = 1;
  if (password.length >= 10) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || (/[A-Z]/.test(password) && /[a-z]/.test(password))) score += 1;

  if (score <= 1) {
    return { score: 1, label: 'Weak', color: '#FF4466', isAcceptable: true };
  }
  if (score === 2) {
    return { score: 2, label: 'Fair', color: '#F5C518', isAcceptable: true };
  }
  return { score: Math.min(4, score), label: 'Strong', color: '#00FF88', isAcceptable: true };
}
