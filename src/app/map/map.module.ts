import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular/lazy';

import { MapPageRoutingModule } from './map-routing.module';
import { MapPage } from './map.page';

@NgModule({
  imports: [CommonModule, IonicModule, MapPageRoutingModule],
  declarations: [MapPage],
})
export class MapPageModule {}
