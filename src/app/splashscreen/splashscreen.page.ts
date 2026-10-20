import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-splashscreen',
  templateUrl: './splashscreen.page.html',
  styleUrls: ['./splashscreen.page.scss'],
  standalone: false,
})
export class SplashscreenPage implements OnInit, OnDestroy {
  private router = inject(Router);
  private navCtrl = inject(NavController);

  version = '0.2 InDev';
  progress = 0;
  isLoaded = false;

  private intervalId: any;
  private timeoutId: any;
  private hasNavigated = false;

  ngOnInit() {
    this.startLoading();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private startLoading() {
    const totalDuration = 2600; // ~2.6 seconds total
    const stepInterval = 35; // ms per tick
    const totalTicks = totalDuration / stepInterval;
    let currentTick = 0;

    this.intervalId = setInterval(() => {
      currentTick++;
      const rawProgress = (currentTick / totalTicks) * 100;
      this.progress = Math.min(100, Math.floor(rawProgress));

      if (this.progress >= 100) {
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.isLoaded = true;

        this.timeoutId = setTimeout(() => {
          this.proceedToApp();
        }, 600);
      }
    }, stepInterval);
  }

  proceedToApp() {
    if (this.hasNavigated) return;
    this.hasNavigated = true;
    this.cleanup();

    this.navCtrl.navigateRoot('/login', {
      animated: true,
      animationDirection: 'forward',
    }).catch(() => {
      this.router.navigateByUrl('/login', { replaceUrl: true });
    });
  }

  private cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
