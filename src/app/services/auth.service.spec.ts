import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AuthService } from './auth.service';

const firebaseMocks = vi.hoisted(() => {
  const authState = {
    currentUser: null as {
      uid: string;
      email: string | null;
      displayName: string | null;
    } | null,
  };

  return {
    authState,
    getApps: vi.fn(() => []),
    initializeApp: vi.fn(() => ({ name: 'test-app' })),
    getAuth: vi.fn(() => authState),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  };
});

vi.mock('firebase/app', () => ({
  getApps: firebaseMocks.getApps,
  initializeApp: firebaseMocks.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: firebaseMocks.getAuth,
  createUserWithEmailAndPassword: firebaseMocks.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: firebaseMocks.signInWithEmailAndPassword,
  signOut: firebaseMocks.signOut,
}));

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(() => ({})),
}));

describe('AuthService', () => {
  let service: AuthService;

  const firebaseUser = {
    uid: 'uid-1',
    email: 'test@example.com',
    displayName: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.authState.currentUser = null;
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  it('should register a Firebase user with email and password', async () => {
    firebaseMocks.createUserWithEmailAndPassword.mockResolvedValue({
      user: firebaseUser,
    });
    firebaseMocks.authState.currentUser = firebaseUser;

    const result = await service.register('TEST@example.com', 'password123');

    expect(result.success).toBeTruthy();
    expect(result.user?.email).toBe('test@example.com');
    expect(
      firebaseMocks.createUserWithEmailAndPassword
    ).toHaveBeenCalledWith(expect.anything(), 'test@example.com', 'password123');
    expect(service.isAuthenticated()).toBeTruthy();
  });

  it('should report duplicate email errors from Firebase', async () => {
    firebaseMocks.createUserWithEmailAndPassword.mockRejectedValue({
      code: 'auth/email-already-in-use',
    });

    const result = await service.register('test@example.com', 'password456');

    expect(result.success).toBeFalsy();
    expect(result.message).toBe('An account with this email already exists.');
  });

  it('should show an error when an unregistered user tries to sign in', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/invalid-credential',
    });

    const result = await service.login('unregistered@example.com', 'password123');

    expect(result.success).toBeFalsy();
    expect(result.message).toBe(
      'No account found with this email, or the password is incorrect.'
    );
    expect(service.isAuthenticated()).toBeFalsy();
  });

  it('should clear the session on logout', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockResolvedValue({
      user: firebaseUser,
    });
    firebaseMocks.authState.currentUser = firebaseUser;
    firebaseMocks.signOut.mockImplementation(async () => {
      firebaseMocks.authState.currentUser = null;
    });

    await service.logout();

    expect(firebaseMocks.signOut).toHaveBeenCalled();
    expect(service.isAuthenticated()).toBeFalsy();
    expect(service.getCurrentUser()).toBeNull();
  });
});
