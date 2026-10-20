import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { AlertController, AlertOptions, ToastController } from '@ionic/angular';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';

import {
  describeMapPointError,
  MapPoint,
  MapPointsService,
} from '../services/map-points.service';

@Component({
  selector: 'app-map',
  templateUrl: 'map.page.html',
  styleUrls: ['map.page.scss'],
  standalone: false,
})
export class MapPage implements OnDestroy {
  @ViewChild('mapContainer')
  private mapContainer?: ElementRef<HTMLDivElement>;

  private readonly mapPoints = inject(MapPointsService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly changeDetector = inject(ChangeDetectorRef);

  private map?: L.Map;
  private resizeObserver?: ResizeObserver;
  private invalidateTimeout?: ReturnType<typeof setTimeout>;
  private invalidateFrame?: number;

  private pointsSubscription?: Subscription;
  private readonly pointMarkers = new Map<string, L.Marker>();
  private readonly pointData = new Map<string, MapPoint>();
  private pendingMarker?: L.Marker;
  private activePopup?: L.Popup;
  private activeAlert?: HTMLIonAlertElement;
  private draggingPointId: string | null = null;

  addingPoint = false;
  loadingPoints = true;
  pointsCount = 0;

  private readonly userPointIcon = L.divIcon({
    className: 'map-point-marker',
    html: `
      <svg class="map-point-marker__svg" viewBox="0 0 34 44" aria-hidden="true">
        <path d="M17 1.5C8.4 1.5 1.5 8.2 1.5 16.4c0 11 14.2 25 15.2 26a.45.45 0 0 0 .6 0c1-1 15.2-15 15.2-26C32.5 8.2 25.6 1.5 17 1.5z" />
        <circle cx="17" cy="16" r="5.5" />
      </svg>
    `,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -40],
  });

  private readonly pendingPointIcon = L.divIcon({
    className: 'map-point-marker map-point-marker--pending',
    html: '<span class="map-point-pending__pulse"></span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });


  ionViewDidEnter(): void {
    const container = this.mapContainer?.nativeElement;

    if (!container) {
      return;
    }

    this.startPointsSync();

    if (this.map) {
      this.refreshMapSize();
      this.syncPointMarkers();
      return;
    }

    // Wait for the Ionic page transition/layout to settle before measuring.
    requestAnimationFrame(() => {
      if (container.isConnected) {
        this.initializeMap(container);
      }
    });
  }

  private initializeMap(container: HTMLDivElement): void {
    this.map = L.map(container, {
      center: [-7.7715, 110.3778],
      zoom: 16,
      zoomControl: true,
      tapHold: true,
    });

    const map = this.map;

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.addingPoint) {
        void this.openCreatePointDialog(event.latlng);
        return;
      }

      this.closePointPopup();
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    this.syncPointMarkers();

    this.resizeObserver = new ResizeObserver(() => this.refreshMapSize());
    this.resizeObserver.observe(container);

    this.refreshMapSize();
    this.invalidateTimeout = setTimeout(() => this.refreshMapSize(), 350);
  }

  private startPointsSync(): void {
    if (this.pointsSubscription) {
      return;
    }

    this.pointsSubscription = this.mapPoints.watchPoints().subscribe({
      next: (points) => {
        this.loadingPoints = false;
        this.pointsCount = points.length;
        this.pointData.clear();
        points.forEach((point) => this.pointData.set(point.id, point));
        this.syncPointMarkers();
        // Firebase callbacks run outside Angular, so schedule a render explicitly.
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.loadingPoints = false;
        this.pointsSubscription?.unsubscribe();
        this.pointsSubscription = undefined;
        this.changeDetector.markForCheck();
        void this.showToast(
          describeMapPointError(
            error,
            'Gagal memuat titik dari Firebase.'
          ),
          'danger'
        );
      },
    });
  }

  private syncPointMarkers(): void {
    if (!this.map) {
      return;
    }

    const incomingIds = new Set(this.pointData.keys());

    this.pointMarkers.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        marker.remove();
        this.pointMarkers.delete(id);
      }
    });

    this.pointData.forEach((point, id) => {
      const existing = this.pointMarkers.get(id);

      if (!existing) {
        this.pointMarkers.set(id, this.createPointMarker(point));
        return;
      }

      if (this.draggingPointId !== id) {
        existing.setLatLng([point.latitude, point.longitude]);
      }

      existing.options.title = point.name;
      const element = existing.getElement();
      if (element) {
        element.setAttribute('title', point.name);
        element.setAttribute('aria-label', point.name);
      }
    });
  }

  private createPointMarker(point: MapPoint): L.Marker {
    const marker = L.marker([point.latitude, point.longitude], {
      icon: this.userPointIcon,
      draggable: true,
      autoPan: true,
      keyboard: true,
      title: point.name,
      alt: point.name,
      riseOnHover: true,
      zIndexOffset: 500,
    }).addTo(this.map as L.Map);

    marker.bindTooltip('Geser titik untuk memindahkan', {
      direction: 'top',
      offset: [0, -38],
      opacity: 0.95,
      className: 'map-point-tooltip',
    });

    marker.on('click', () => this.openPointPopup(point.id, marker));

    marker.on('contextmenu', (event: L.LeafletMouseEvent) => {
      L.DomEvent.preventDefault(event.originalEvent);
      this.openPointPopup(point.id, marker);
      void this.showToast('Geser titik untuk memindahkan.', 'medium');
    });

    marker.on('dragstart', () => {
      this.draggingPointId = point.id;
      this.closePointPopup();
      marker.getElement()?.classList.add('is-dragging');
    });

    marker.on('dragend', () => {
      void this.saveMarkerPosition(point.id, marker);
    });

    return marker;
  }

  private async saveMarkerPosition(
    id: string,
    marker: L.Marker
  ): Promise<void> {
    const stored = this.pointData.get(id);
    const position = marker.getLatLng();

    this.draggingPointId = null;
    marker.getElement()?.classList.remove('is-dragging');

    if (
      stored &&
      Math.abs(stored.latitude - position.lat) < 0.0000001 &&
      Math.abs(stored.longitude - position.lng) < 0.0000001
    ) {
      return;
    }

    try {
      await this.mapPoints.movePoint(id, position.lat, position.lng);
      await this.showToast('Lokasi titik diperbarui.', 'success');
    } catch (error) {
      if (stored) {
        marker.setLatLng([stored.latitude, stored.longitude]);
      }
      await this.showToast(
        describeMapPointError(error, 'Gagal menyimpan lokasi titik.'),
        'danger'
      );
    }
  }

  private openPointPopup(id: string, marker: L.Marker): void {
    if (!this.map) {
      return;
    }

    const point = this.pointData.get(id);
    if (!point) {
      return;
    }

    this.closePointPopup();

    this.activePopup = L.popup({
      className: 'map-point-popup-wrapper',
      maxWidth: 300,
      minWidth: 220,
      autoPan: true,
      closeButton: true,
      offset: [0, -40],
    })
      .setLatLng(marker.getLatLng())
      .setContent(this.buildPointPopup(point, marker))
      .openOn(this.map);
  }

  private closePointPopup(): void {
    if (this.activePopup) {
      this.map?.closePopup(this.activePopup);
      this.activePopup = undefined;
    }
  }

  private buildPointPopup(point: MapPoint, marker: L.Marker): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'map-point-popup';

    const title = document.createElement('strong');
    title.className = 'map-point-popup__title';
    title.textContent = point.name;

    const description = document.createElement('p');
    description.className = 'map-point-popup__description';
    description.textContent = point.description || 'Tanpa deskripsi.';

    const coordinates = document.createElement('div');
    coordinates.className = 'map-point-popup__coords';
    coordinates.textContent = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;

    const actions = document.createElement('div');
    actions.className = 'map-point-popup__actions';

    const moveButton = this.createPopupButton('Pindahkan', () => {
      this.closePointPopup();
      marker.getElement()?.classList.add('is-movable');
      marker.openTooltip();
      window.setTimeout(() => {
        marker.closeTooltip();
        marker.getElement()?.classList.remove('is-movable');
      }, 1600);
      void this.showToast('Geser titik ke lokasi baru.', 'medium');
    });

    const editButton = this.createPopupButton('Edit', () => {
      this.closePointPopup();
      void this.openEditPointDialog(point);
    });

    const deleteButton = this.createPopupButton(
      'Hapus',
      () => {
        this.closePointPopup();
        void this.confirmDeletePoint(point);
      },
      true
    );

    actions.append(moveButton, editButton, deleteButton);
    wrapper.append(title, description, coordinates, actions);

    return wrapper;
  }

  private createPopupButton(
    label: string,
    onClick: () => void,
    danger = false
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-point-popup__button';
    if (danger) {
      button.classList.add('map-point-popup__button--danger');
    }
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  toggleAddMode(): void {
    this.addingPoint = !this.addingPoint;

    if (this.addingPoint) {
      this.closePointPopup();
      this.pendingMarker?.remove();
      this.pendingMarker = undefined;
      void this.showToast('Ketuk peta untuk menaruh titik baru.', 'medium');
      return;
    }

    this.removePendingMarker();
  }

  private async openCreatePointDialog(
    latlng: L.LatLng
  ): Promise<void> {
    if (!this.map || !this.addingPoint) {
      return;
    }

    this.removePendingMarker();
    this.pendingMarker = L.marker(latlng, {
      icon: this.pendingPointIcon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 900,
    }).addTo(this.map);

    const alert = await this.presentAlert({
      header: 'Tambah titik baru',
      subHeader: `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`,
      message: 'Titik akan disimpan ke Firebase Realtime Database.',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Nama titik',
          value: '',
          attributes: {
            maxlength: 80,
            'aria-label': 'Nama titik',
          },
        },
        {
          name: 'description',
          type: 'textarea',
          placeholder: 'Deskripsi (opsional)',
          value: '',
          attributes: {
            maxlength: 240,
            rows: 2,
            'aria-label': 'Deskripsi titik',
          },
        },
      ],
      buttons: [
        { text: 'Batal', role: 'cancel' },
        {
          text: 'Simpan',
          handler: async (values: unknown) => {
            const data = values as {
              name?: unknown;
              description?: unknown;
            };

            try {
              await this.mapPoints.createPoint({
                name: typeof data.name === 'string' ? data.name : '',
                description:
                  typeof data.description === 'string'
                    ? data.description
                    : '',
                latitude: latlng.lat,
                longitude: latlng.lng,
              });
              this.addingPoint = false;
              this.removePendingMarker();
              this.changeDetector.markForCheck();
              await this.showToast('Titik baru ditambahkan.', 'success');
              return true;
            } catch (error) {
              await this.showToast(
                describeMapPointError(error, 'Gagal menambahkan titik.'),
                'danger'
              );
              return false;
            }
          },
        },
      ],
    });

    await alert.onDidDismiss();
    this.removePendingMarker();
  }

  private removePendingMarker(): void {
    this.pendingMarker?.remove();
    this.pendingMarker = undefined;
  }

  private async openEditPointDialog(point: MapPoint): Promise<void> {
    await this.presentAlert({
      header: 'Edit titik',
      subHeader: point.name,
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Nama titik',
          value: point.name,
          attributes: {
            maxlength: 80,
            'aria-label': 'Nama titik',
          },
        },
        {
          name: 'description',
          type: 'textarea',
          placeholder: 'Deskripsi (opsional)',
          value: point.description,
          attributes: {
            maxlength: 240,
            rows: 2,
            'aria-label': 'Deskripsi titik',
          },
        },
      ],
      buttons: [
        { text: 'Batal', role: 'cancel' },
        {
          text: 'Simpan',
          handler: async (values: unknown) => {
            const data = values as {
              name?: unknown;
              description?: unknown;
            };

            try {
              await this.mapPoints.updatePoint(point.id, {
                name: typeof data.name === 'string' ? data.name : '',
                description:
                  typeof data.description === 'string'
                    ? data.description
                    : '',
              });
              await this.showToast('Titik diperbarui.', 'success');
              return true;
            } catch (error) {
              await this.showToast(
                describeMapPointError(error, 'Gagal memperbarui titik.'),
                'danger'
              );
              return false;
            }
          },
        },
      ],
    });
  }

  private async confirmDeletePoint(point: MapPoint): Promise<void> {
    await this.presentAlert({
      header: 'Hapus titik?',
      message: `"${point.name}" akan dihapus dari peta dan Firebase.`,
      buttons: [
        { text: 'Batal', role: 'cancel' },
        {
          text: 'Hapus',
          role: 'destructive',
          handler: async () => {
            try {
              await this.mapPoints.deletePoint(point.id);
              await this.showToast('Titik dihapus.', 'success');
              return true;
            } catch (error) {
              await this.showToast(
                describeMapPointError(error, 'Gagal menghapus titik.'),
                'danger'
              );
              return false;
            }
          },
        },
      ],
    });
  }

  private async presentAlert(
    options: AlertOptions
  ): Promise<HTMLIonAlertElement> {
    await this.activeAlert?.dismiss();

    const alert = await this.alertController.create(options);
    this.activeAlert = alert;

    void alert.onDidDismiss().then(() => {
      if (this.activeAlert === alert) {
        this.activeAlert = undefined;
      }
    });

    await alert.present();
    return alert;
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'medium' = 'medium'
  ): Promise<void> {
    const toast = await this.toastController.create({
      message,
      color,
      duration: 2200,
      position: 'bottom',
    });

    await toast.present();
  }

  private refreshMapSize(): void {
    if (!this.map || this.invalidateFrame !== undefined) {
      return;
    }

    // Coalesce resize notifications that fire while Ionic lays the page out.
    this.invalidateFrame = requestAnimationFrame(() => {
      this.invalidateFrame = undefined;
      this.map?.invalidateSize({ pan: false });
    });
  }

  ngOnDestroy(): void {
    if (this.invalidateTimeout) {
      clearTimeout(this.invalidateTimeout);
      this.invalidateTimeout = undefined;
    }

    if (this.invalidateFrame !== undefined) {
      cancelAnimationFrame(this.invalidateFrame);
      this.invalidateFrame = undefined;
    }

    this.pointsSubscription?.unsubscribe();
    this.pointsSubscription = undefined;

    if (this.activeAlert) {
      void this.activeAlert.dismiss().catch(() => undefined);
      this.activeAlert = undefined;
    }

    this.removePendingMarker();
    this.closePointPopup();
    this.pointMarkers.clear();
    this.pointData.clear();

    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    this.map?.remove();
    this.map = undefined;
  }
}
