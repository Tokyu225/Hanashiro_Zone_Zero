import { inject, Injectable } from '@angular/core';
import {
  Database,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';
import { Observable } from 'rxjs';

import { firebaseDatabase } from '../firebase';
import { AuthService } from './auth.service';

/** Firebase Realtime Database path that stores every user-created map point. */
export const MAP_POINTS_PATH = 'mapPoints';

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;

export interface MapPoint {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
}

export interface MapPointDetails {
  name: string;
  description: string;
}

export interface NewMapPoint {
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
}

/**
 * CRUD access for user-created points on the campus map.
 *
 * Data lives at `/mapPoints/{pushId}` in Firebase Realtime Database:
 * `{ name, description, latitude, longitude, createdAt, updatedAt, createdBy }`.
 * `watchPoints()` keeps every connected client in sync in real time.
 */
@Injectable({
  providedIn: 'root',
})
export class MapPointsService {
  private readonly database: Database = firebaseDatabase;
  private readonly auth = inject(AuthService);

  watchPoints(): Observable<MapPoint[]> {
    return new Observable<MapPoint[]>((subscriber) => {
      const unsubscribe = onValue(
        ref(this.database, MAP_POINTS_PATH),
        (snapshot) => {
          const raw = snapshot.val() as Record<string, unknown> | null;
          const points = raw
            ? Object.entries(raw)
                .map(([id, value]) => MapPointsService.fromRecord(id, value))
                .filter((point): point is MapPoint => point !== null)
                .sort(
                  (first, second) =>
                    first.createdAt - second.createdAt ||
                    first.name.localeCompare(second.name)
                )
            : [];

          subscriber.next(points);
        },
        (error: Error) => subscriber.error(error)
      );

      return () => unsubscribe();
    });
  }

  async createPoint(point: NewMapPoint): Promise<MapPoint> {
    const details = MapPointsService.normalizeDetails(
      point.name,
      point.description
    );
    MapPointsService.assertCoordinates(point.latitude, point.longitude);

    const pointsRef = ref(this.database, MAP_POINTS_PATH);
    const pointRef = push(pointsRef);
    const id = pointRef.key;

    if (!id) {
      throw new Error('Gagal membuat ID titik baru.');
    }

    const now = Date.now();
    const record = {
      ...details,
      latitude: point.latitude,
      longitude: point.longitude,
      createdAt: now,
      updatedAt: now,
      createdBy: this.auth.getCurrentUser()?.uid ?? null,
    };

    await set(pointRef, record);

    return { id, ...record };
  }

  async updatePoint(id: string, details: MapPointDetails): Promise<void> {
    const normalized = MapPointsService.normalizeDetails(
      details.name,
      details.description
    );

    await update(ref(this.database, `${MAP_POINTS_PATH}/${id}`), {
      ...normalized,
      updatedAt: Date.now(),
    });
  }

  async movePoint(
    id: string,
    latitude: number,
    longitude: number
  ): Promise<void> {
    MapPointsService.assertCoordinates(latitude, longitude);

    await update(ref(this.database, `${MAP_POINTS_PATH}/${id}`), {
      latitude,
      longitude,
      updatedAt: Date.now(),
    });
  }

  async deletePoint(id: string): Promise<void> {
    await remove(ref(this.database, `${MAP_POINTS_PATH}/${id}`));
  }

  private static fromRecord(id: string, value: unknown): MapPoint | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const name =
      typeof record['name'] === 'string' ? record['name'].trim() : '';
    const latitude = MapPointsService.toFiniteNumber(record['latitude']);
    const longitude = MapPointsService.toFiniteNumber(record['longitude']);

    if (
      !name ||
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return {
      id,
      name,
      description:
        typeof record['description'] === 'string'
          ? record['description']
          : '',
      latitude,
      longitude,
      createdAt: MapPointsService.toFiniteNumber(record['createdAt']) ?? 0,
      updatedAt: MapPointsService.toFiniteNumber(record['updatedAt']) ?? 0,
      createdBy:
        typeof record['createdBy'] === 'string' ? record['createdBy'] : null,
    };
  }

  private static normalizeDetails(
    name: unknown,
    description: unknown
  ): MapPointDetails {
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedName) {
      throw new Error('Nama titik wajib diisi.');
    }

    if (normalizedName.length > MAX_NAME_LENGTH) {
      throw new Error(`Nama titik maksimal ${MAX_NAME_LENGTH} karakter.`);
    }

    const normalizedDescription =
      typeof description === 'string' ? description.trim() : '';

    if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(
        `Deskripsi titik maksimal ${MAX_DESCRIPTION_LENGTH} karakter.`
      );
    }

    return {
      name: normalizedName,
      description: normalizedDescription,
    };
  }

  private static assertCoordinates(
    latitude: number,
    longitude: number
  ): void {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error('Koordinat lintang tidak valid.');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Koordinat bujur tidak valid.');
    }
  }

  private static toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}

/** Translates Firebase/validation failures into messages suitable for the UI. */
export function describeMapPointError(
  error: unknown,
  fallback = 'Terjadi kesalahan saat mengakses titik peta.'
): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'PERMISSION_DENIED':
    case 'permission-denied':
      return 'Akses database ditolak. Periksa Firebase Realtime Database Rules.';
    case 'NETWORK_ERROR':
    case 'network-request-failed':
      return 'Koneksi bermasalah. Periksa jaringan lalu coba lagi.';
    case 'UNAVAILABLE':
    case 'unavailable':
      return 'Database sedang tidak tersedia. Coba lagi sebentar lagi.';
    default:
      break;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

