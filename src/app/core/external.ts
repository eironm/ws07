import { Capacitor } from '@capacitor/core';

import { LatLng } from './geo-utils';

/** Opens the coordinates in the phone's maps app (Google Maps on Android). */
export function openInMaps(p: LatLng, label = 'Payment location') {
  const q = `${p.lat},${p.lng}`;
  if (Capacitor.getPlatform() === 'android') {
    // geo: URIs are handled by Capacitor as an external intent.
    window.location.href = `geo:${q}?q=${q}(${encodeURIComponent(label)})`;
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  }
}

