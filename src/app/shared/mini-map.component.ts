import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { createMap, dotPin } from '../core/map-utils';

/** Small, non-interactive map preview showing one pin + its accuracy circle. */
@Component({
  selector: 'app-mini-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="mini-map" [style.height.px]="height()"></div>`,
  styles: `
    :host {
      display: block;
      border-radius: 16px;
      overflow: hidden;
      isolation: isolate;
    }
    .mini-map {
      width: 100%;
    }
  `,
})
export class MiniMapComponent implements OnDestroy {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly accuracy = input<number | null>(null);
  readonly color = input('#5b5fef');
  readonly height = input(160);
  readonly zoom = input(17);

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private map?: L.Map;
  private marker?: L.Marker;
  private circle?: L.Circle;

  constructor() {
    afterNextRender(() => {
      this.map = createMap(this.host().nativeElement, {
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        attributionControl: false,
      });
      this.render();
    });

    // Re-render whenever the inputs change (e.g. user adjusts the location).
    effect(() => {
      this.lat();
      this.lng();
      this.accuracy();
      this.color();
      this.render();
    });
  }

  private render() {
    if (!this.map) return;
    const pos = L.latLng(this.lat(), this.lng());
    this.map.setView(pos, this.zoom(), { animate: false });
    // Pass the icon up front: Leaflet's default marker would request images the build doesn't ship.
    this.marker ??= L.marker(pos, { interactive: false, icon: dotPin(this.color()) }).addTo(this.map);
    this.marker.setLatLng(pos).setIcon(dotPin(this.color()));

    const acc = this.accuracy();
    if (acc && acc > 5 && acc < 2000) {
      this.circle ??= L.circle(pos, { radius: acc, weight: 1, interactive: false }).addTo(this.map);
      this.circle.setLatLng(pos).setRadius(acc).setStyle({ color: this.color(), fillColor: this.color(), fillOpacity: 0.12 });
      // Zoom out so a large (imprecise) accuracy circle fits in the preview.
      if (acc > 80) this.map.fitBounds(this.circle.getBounds(), { animate: false, padding: [8, 8] });
    } else if (this.circle) {
      this.circle.remove();
      this.circle = undefined;
    }
  }

  ngOnDestroy() {
    this.map?.remove();
  }
}
