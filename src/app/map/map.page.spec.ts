import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { MapPointsService } from '../services/map-points.service';
import { MapPageModule } from './map.module';
import { MapPage } from './map.page';

vi.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: () => ({ name: 'test-app' }),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: null }),
}));

vi.mock('firebase/database', () => ({
  getDatabase: () => ({ name: 'test-database' }),
}));

describe('MapPage', () => {
  let component: MapPage;
  let fixture: ComponentFixture<MapPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapPageModule, RouterModule.forRoot([])],
      providers: [
        {
          provide: MapPointsService,
          useValue: {
            watchPoints: () => of([]),
            createPoint: vi.fn(),
            updatePoint: vi.fn(),
            movePoint: vi.fn(),
            deletePoint: vi.fn(),
          },
        },
        {
          provide: AlertController,
          useValue: { create: vi.fn() },
        },
        {
          provide: ToastController,
          useValue: {
            create: vi.fn().mockResolvedValue({ present: vi.fn() }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle add-point mode', () => {
    component.toggleAddMode();

    expect(component.addingPoint).toBe(true);

    component.toggleAddMode();

    expect(component.addingPoint).toBe(false);
  });
});

