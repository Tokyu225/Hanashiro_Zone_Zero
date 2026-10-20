import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from './auth.service';
import { MapPointsService } from './map-points.service';

const firebaseMocks = vi.hoisted(() => {
  const listeners = {
    next: null as ((snapshot: { val: () => unknown }) => void) | null,
    error: null as ((error: Error) => void) | null,
    unsubscribe: vi.fn(),
  };

  return {
    listeners,
    ref: vi.fn((_database: unknown, path: string) => ({ path })),
    push: vi.fn(() => ({ key: 'point-1', path: 'mapPoints/point-1' })),
    set: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    onValue: vi.fn(
      (
        _reference: unknown,
        next: (snapshot: { val: () => unknown }) => void,
        error: (error: Error) => void
      ) => {
        listeners.next = next;
        listeners.error = error;
        return listeners.unsubscribe;
      }
    ),
  };
});

vi.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: () => ({ name: 'test-app' }),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: null }),
}));

vi.mock('firebase/database', () => ({
  getDatabase: () => ({ name: 'test-database' }),
  ref: firebaseMocks.ref,
  push: firebaseMocks.push,
  set: firebaseMocks.set,
  update: firebaseMocks.update,
  remove: firebaseMocks.remove,
  onValue: firebaseMocks.onValue,
}));

describe('MapPointsService', () => {
  let service: MapPointsService;

  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.listeners.next = null;
    firebaseMocks.listeners.error = null;
    firebaseMocks.push.mockReturnValue({
      key: 'point-1',
      path: 'mapPoints/point-1',
    });
    firebaseMocks.set.mockResolvedValue(undefined);
    firebaseMocks.update.mockResolvedValue(undefined);
    firebaseMocks.remove.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { getCurrentUser: () => ({ uid: 'uid-1' }) },
        },
      ],
    });

    service = TestBed.inject(MapPointsService);
  });

  it('should create a point under /mapPoints and return its id', async () => {
    const point = await service.createPoint({
      name: '  Gedung A  ',
      description: '  Dekat danau  ',
      latitude: -7.7715,
      longitude: 110.3778,
    });

    expect(point.id).toBe('point-1');
    expect(firebaseMocks.push).toHaveBeenCalled();
    expect(firebaseMocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'mapPoints/point-1' }),
      expect.objectContaining({
        name: 'Gedung A',
        description: 'Dekat danau',
        latitude: -7.7715,
        longitude: 110.3778,
        createdBy: 'uid-1',
      })
    );
  });

  it('should reject a blank point name before writing to Firebase', async () => {
    await expect(
      service.createPoint({
        name: '   ',
        latitude: -7.7715,
        longitude: 110.3778,
      })
    ).rejects.toThrow('Nama titik wajib diisi.');

    expect(firebaseMocks.set).not.toHaveBeenCalled();
  });

  it('should reject coordinates outside the valid map range', async () => {
    await expect(
      service.createPoint({
        name: 'Titik salah',
        latitude: 120,
        longitude: 110.3778,
      })
    ).rejects.toThrow('Koordinat lintang tidak valid.');
  });

  it('should update the editable details of a point', async () => {
    await service.updatePoint('point-1', {
      name: '  Perpustakaan  ',
      description: '  Lantai 2  ',
    });

    expect(firebaseMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'mapPoints/point-1' }),
      expect.objectContaining({
        name: 'Perpustakaan',
        description: 'Lantai 2',
        updatedAt: expect.any(Number),
      })
    );
  });

  it('should persist a dragged position', async () => {
    await service.movePoint('point-1', -7.8, 110.4);

    expect(firebaseMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'mapPoints/point-1' }),
      expect.objectContaining({
        latitude: -7.8,
        longitude: 110.4,
        updatedAt: expect.any(Number),
      })
    );
  });

  it('should delete a point', async () => {
    await service.deletePoint('point-1');

    expect(firebaseMocks.remove).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'mapPoints/point-1' })
    );
  });

  it('should stream, normalize, and sort points from Firebase', async () => {
    const pointsPromise = firstValueFrom(service.watchPoints());

    firebaseMocks.listeners.next?.({
      val: () => ({
        second: {
          name: 'B',
          description: 'Second',
          latitude: -7.77,
          longitude: 110.37,
          createdAt: 2,
          updatedAt: 2,
        },
        first: {
          name: 'A',
          description: 'First',
          latitude: '-7.78',
          longitude: '110.38',
          createdAt: 1,
          updatedAt: 1,
          createdBy: 'uid-1',
        },
        invalid: {
          name: '',
          latitude: 1,
          longitude: 2,
          createdAt: 3,
        },
      }),
    });

    const points = await pointsPromise;

    expect(points.map((point) => point.name)).toEqual(['A', 'B']);
    expect(points[0]).toEqual(
      expect.objectContaining({
        id: 'first',
        latitude: -7.78,
        longitude: 110.38,
        createdBy: 'uid-1',
      })
    );
  });

  it('should forward Firebase read errors', async () => {
    const pointsPromise = firstValueFrom(service.watchPoints());

    firebaseMocks.listeners.error?.(new Error('offline'));

    await expect(pointsPromise).rejects.toThrow('offline');
  });
});
