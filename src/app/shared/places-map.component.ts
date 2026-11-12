import type { ElementRef, OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, afterNextRender, effect, input, viewChild } from '@angular/core';
import * as L from 'leaflet';

import type { LatLng } from '../core/geo-utils';
import { createMap } from '../core/map-utils';

/**
 * Static strip map with numbered pins (1, 2, 3…) that match a numbered list next to it.
 * Not interactive: the page decides what tapping the strip does.
 */
@Component({
  selector: 'app-places-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="places-map" [style.height.px]="height()"></div>`,
  styles: `
    :host {
      display: block;
      overflow: hidden;
      isolation: isolate;
    }
    .places-map {
      width: 100%;
    }
  `,
})
export class PlacesMapComponent implements OnDestroy {
  readonly points = input.required<LatLng[]>();
  readonly height = input(148);

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private map?: L.Map;
  private pins?: L.LayerGroup;

  constructor() {
    afterNextRender(() => {
      this.map = createMap(this.host().nativeElement, {
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomSnap: 0.25,
      });
      this.render();
    });

    effect(() => {
      this.points();
      this.render();
    });
  }

  private render(): void {
    if (!this.map) return;
    const pts = this.points();
    this.pins?.remove();
    this.pins = L.layerGroup(
      pts.map((p, i) =>
        L.marker([p.lat, p.lng], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'ft-pin-wrap',
            html: `<div class="ft-step ft-step--brand">${i + 1}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
        }),
      ),
    ).addTo(this.map);

    if (pts.length === 1) {
      this.map.setView([pts[0].lat, pts[0].lng], 16, { animate: false });
    } else if (pts.length > 1) {
      const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple));
      this.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16, animate: false });
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
