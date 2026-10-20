import { Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';

import { firebaseAuth } from '../firebase';

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
}

export interface AuthResult {
  success: boolean;
  message: string;
  user?: AuthUser;
}

/**
 * Authentication backed by Firebase Authentication (email/password).
 * Sessions are persisted by Firebase across app reloads.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth: Auth = firebaseAuth;

  async register(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return { success: false, message: 'Please fill in all fields.' };
    }

    try {
      const credential = await createUserWithEmailAndPassword(
        this.auth,
        normalizedEmail,
        password
      );

      return {
        success: true,
        message: 'Account created successfully.',
        user: AuthService.toAuthUser(credential.user, normalizedEmail),
      };
    } catch (error) {
      return { success: false, message: AuthService.describeError(error) };
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return { success: false, message: 'Please enter your email and password.' };
    }

    try {
      const credential = await signInWithEmailAndPassword(
        this.auth,
        normalizedEmail,
        password
      );

      return {
        success: true,
        message: 'Signed in successfully.',
        user: AuthService.toAuthUser(credential.user, normalizedEmail),
      };
    } catch (error) {
      return { success: false, message: AuthService.describeError(error) };
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  getCurrentUser(): AuthUser | null {
    const user = this.auth.currentUser;
    return user ? AuthService.toAuthUser(user) : null;
  }

  isAuthenticated(): boolean {
    return this.auth.currentUser !== null;
  }

  private static toAuthUser(user: User, fallbackEmail = ''): AuthUser {
    const email = user.email ?? fallbackEmail;

    return {
      uid: user.uid,
      name: user.displayName || email.split('@')[0] || 'Player',
      email,
    };
  }

  private static describeError(error: unknown): string {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';

    switch (code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/invalid-email':
        return 'That email address is not valid.';
      case 'auth/weak-password':
        return 'Your password is too weak. Use at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'No account found with this email, or the password is incorrect.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Contact support for help.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is not enabled for this project.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
