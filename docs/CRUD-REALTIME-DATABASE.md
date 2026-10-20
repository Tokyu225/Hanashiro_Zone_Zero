# Dokumentasi Sistem CRUD & Firebase Realtime Database

> Proyek: **Hanashiro Zone Zero** — Aplikasi Peta Kampus (Ionic + Angular + Firebase)
>
> File utama:
> - `src/app/services/map-points.service.ts` — Service CRUD titik peta
> - `src/app/firebase.ts` — Inisialisasi Firebase
> - `src/app/map/map.page.ts` — Halaman peta (konsumen service)
> - `src/environments/environment.ts` — Konfigurasi Firebase

---

## 1. Gambaran Umum Arsitektur

Aplikasi ini menyimpan semua titik (marker) yang dibuat pengguna di **Firebase Realtime Database (RTDB)**. Setiap klien yang terhubung akan **selalu sinkron secara real-time** melalui listener `onValue`.

```
┌──────────────────┐  create/update/move/delete   ┌─────────────────────────┐
│   MapPage        │ ───────────────────────────► │   Firebase RTDB         │
│  (map.page.ts)   │                              │   /mapPoints/{pushId}   │
│                  │ ◄─────────────────────────── │                         │
└──────────────────┘   watchPoints() (onValue)    └─────────────────────────┘
        ▲
        │ inject
        │
┌──────────────────────────────┐
│  MapPointsService            │
│  (map-points.service.ts)     │
│  - watchPoints()    → Read   │
│  - createPoint()    → Create │
│  - updatePoint()    → Update │
│  - movePoint()      → Update │
│  - deletePoint()    → Delete │
└──────────────────────────────┘
```

### Struktur Data di Realtime Database

Path: `/mapPoints/{pushId}`

```json
{
  "mapPoints": {
    "-NxK9z8ExampleID1": {
      "name": "Perpustakaan Pusat UGM",
      "description": "Perpustakaan utama kampus.",
      "latitude": -7.7736,
      "longitude": 110.3786,
      "createdAt": 1730000000000,
      "updatedAt": 1730000000000,
      "createdBy": "uid-pengguna-atau-null"
    }
  }
}
```

| Field         | Tipe             | Keterangan                              |
| ------------- | ---------------- | --------------------------------------- |
| `id`          | `string`         | Push ID dari Firebase (key node)        |
| `name`        | `string`         | Nama titik, wajib, maks. 80 karakter    |
| `description` | `string`         | Deskripsi titik, maks. 240 karakter     |
| `latitude`    | `number`         | Koordinat lintang (-90 s/d 90)          |
| `longitude`   | `number`         | Koordinat bujur (-180 s/d 180)          |
| `createdAt`   | `number`         | Timestamp pembuatan (epoch ms)          |
| `updatedAt`   | `number`         | Timestamp perubahan terakhir (epoch ms) |
| `createdBy`   | `string\|null`   | UID pengguna dari Firebase Auth         |

---

## 2. Inisialisasi Firebase

File `src/app/firebase.ts` membuat satu instance aplikasi Firebase yang dipakai bersama oleh Auth dan Realtime Database. Pola `getApps()` mencegah error *"duplicate-app"* saat hot reload:

```ts
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Database, getDatabase } from 'firebase/database';

import { environment } from '../environments/environment';

const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(environment.firebase);

export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firebaseDatabase: Database = getDatabase(firebaseApp);
```

Konfigurasi kredensial (`environment.firebase`) berada di `src/environments/environment.ts`.

---

## 3. Model Data & Konstanta

```ts
/** Firebase Realtime Database path yang menyimpan semua titik peta pengguna. */
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
```

---

## 4. Operasi CRUD

### 4.1 READ — `watchPoints()` (Real-time Sync)

Menggunakan `onValue()` dari Firebase SDK sehingga observer menerima data terbaru **setiap kali data berubah di database** (dari klien mana pun). Data mentah di-*parse* dan divalidasi lewat `fromRecord()`, lalu diurutkan berdasarkan waktu pembuatan dan nama:

```ts
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
```

Catatan:
- Titik dengan data tidak valid (misal `latitude` kosong) otomatis **dilewati** oleh `fromRecord()` (mengembalikan `null` lalu di-filter).
- Fungsi yang dikembalikan (`() => unsubscribe()`) dipakai Angular untuk membatalkan listener saat halaman ditutup.

### 4.2 CREATE — `createPoint()`

Membuat push ID unik dengan `push()`, menyimpan data dengan `set()`, dan mencatat UID pembuat dari `AuthService`:

```ts
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
```

### 4.3 UPDATE — `updatePoint()` dan `movePoint()`

`updatePoint()` mengubah nama & deskripsi sekaligus memperbarui `updatedAt`. `update()` hanya menimpa field yang dikirim (partial update), bukan seluruh node:

```ts
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
```

`movePoint()` khusus memindahkan koordinat titik (misalnya saat marker di-*drag* pada peta):

```ts
async movePoint(id: string, latitude: number, longitude: number): Promise<void> {
  MapPointsService.assertCoordinates(latitude, longitude);

  await update(ref(this.database, `${MAP_POINTS_PATH}/${id}`), {
    latitude,
    longitude,
    updatedAt: Date.now(),
  });
}
```

### 4.4 DELETE — `deletePoint()`

Menghapus node titik beserta seluruh isinya:

```ts
async deletePoint(id: string): Promise<void> {
  await remove(ref(this.database, `${MAP_POINTS_PATH}/${id}`));
}
```

---

## 5. Validasi & Normalisasi Input

Semua operasi tulis melewati lapisan validasi berikut sebelum menyentuh database.

### 5.1 Validasi Nama & Deskripsi — `normalizeDetails()`

```ts
private static normalizeDetails(name: unknown, description: unknown): MapPointDetails {
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
```

### 5.2 Validasi Koordinat — `assertCoordinates()`

```ts
private static assertCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Koordinat lintang tidak valid.');
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Koordinat bujur tidak valid.');
  }
}
```

### 5.3 Parsing Data dari Database — `fromRecord()`

Memastikan data yang masuk dari RTDB valid sebelum dipakai UI (data rusak akan menghasilkan `null` dan diabaikan):

```ts
private static fromRecord(id: string, value: unknown): MapPoint | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
  const latitude = MapPointsService.toFiniteNumber(record['latitude']);
  const longitude = MapPointsService.toFiniteNumber(record['longitude']);

  if (
    !name ||
    latitude === null ||
    longitude === null ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    return null;
  }

  return {
    id,
    name,
    description:
      typeof record['description'] === 'string' ? record['description'] : '',
    latitude,
    longitude,
    createdAt: MapPointsService.toFiniteNumber(record['createdAt']) ?? 0,
    updatedAt: MapPointsService.toFiniteNumber(record['updatedAt']) ?? 0,
    createdBy:
      typeof record['createdBy'] === 'string' ? record['createdBy'] : null,
  };
}
```

---

## 6. Integrasi dengan Halaman Peta (`map.page.ts`)

### 6.1 Berlangganan Data Real-time

Halaman peta menyimpan subscription dan sinkronisasi marker setiap kali data berubah:

```ts
private startPointsSync(): void {
  if (this.pointsSubscription) {
    return;
  }

  this.pointsSubscription = this.mapPoints.watchPoints().subscribe({
    next: (points) => {
      this.loadingPoints = false;
      this.pointsCount = points.length;
      // ... perbarui pointData & pointMarkers, lalu render marker Leaflet
    },
    error: (error) => {
      this.loadingPoints = false;
      // tampilkan toast error
    },
  });
}
```

Subscription dihentikan saat halaman dihancurkan agar tidak terjadi memory leak:

```ts
ngOnDestroy(): void {
  this.pointsSubscription?.unsubscribe();
  this.pointsSubscription = undefined;
  // ... bersih-bersih marker, map, observer
}
```

### 6.2 Contoh Pemanggilan Create

Saat pengguna menyalakan mode tambah (`addingPoint = true`), klik peta membuka dialog pembuatan titik:

```ts
map.on('click', (event: L.LeafletMouseEvent) => {
  if (this.addingPoint) {
    void this.openCreatePointDialog(event.latlng);
    return;
  }
  this.closePointPopup();
});
```

### 6.3 Contoh Pemanggilan Update & Delete (via Alert)

```ts
// Update
await this.mapPoints.updatePoint(point.id, {
  name: typeof data.name === 'string' ? data.name : '',
  description: typeof data.description === 'string' ? data.description : '',
});
await this.showToast('Titik diperbarui.', 'success');

// Delete
await this.mapPoints.deletePoint(point.id);
await this.showToast('Titik dihapus.', 'success');
```

Semua error dari operasi database diterjemahkan menjadi pesan yang ramah pengguna oleh helper berikut:

```ts
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
```

---

## 7. Ringkasan Aliran Data (Contoh Skenario)

**Menambah titik baru:**

1. Pengguna menyalakan mode tambah (`addingPoint = true`) lalu klik peta.
2. `openCreatePointDialog(latlng)` menampilkan form nama & deskripsi.
3. Saat disimpan, `MapPointsService.createPoint()` dipanggil.
4. Service memvalidasi input, membuat push ID via `push()`, lalu menulis dengan `set()`.
5. RTDB memicu event `onValue` di **semua** klien yang terhubung.
6. `watchPoints()` mengeluarkan array `MapPoint` terbaru → `map.page.ts` menggambar ulang marker.

**Menghapus titik:**

1. Pengguna memilih titik → dialog konfirmasi "Hapus titik?".
2. `deletePoint(id)` memanggil `remove()` pada path `/mapPoints/{id}`.
3. Semua klien otomatis menerima snapshot terbaru dan marker hilang dari peta.

---

## 8. Catatan Penting

- **Push ID** dipakai sebagai key (`-NxK9z8...`) karena unik dan dapat dibuat secara *offline-friendly* tanpa tabrakan.
- **`set()` vs `update()`**: `set()` menimpa seluruh node (dipakai saat create), sedangkan `update()` hanya mengubah field tertentu (dipakai saat update/move).
- **Keamanan**: akses ditentukan oleh *Realtime Database Rules* di console Firebase. Error `PERMISSION_DENIED` berarti rules perlu diperiksa.
- **Identity pembuat**: field `createdBy` diisi dari `AuthService.getCurrentUser()?.uid ?? null`, sehingga titik yang dibuat tanpa login bernilai `null`.



