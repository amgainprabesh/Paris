import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_KM2,
  CAMERA_PRESETS,
  EIFFEL_ORIGIN,
  EIFFEL_SPECS,
  PARIS_LANDMARKS,
  RADIUS_3KM2,
  SEINE_CENTERLINE,
  distanceFromOrigin,
  eiffelInnerHalfWidthAt,
  eiffelOuterHalfWidthAt,
  latLngToLocal,
  localToLatLng,
  sampleSeineProximity,
  terrainHeightAt,
} from './parisGeo';

test('3 km² radius computes accurately to ~977.2 m', () => {
  const computedAreaKm2 = (Math.PI * RADIUS_3KM2 * RADIUS_3KM2) / 1_000_000;
  assert.ok(Math.abs(computedAreaKm2 - AREA_KM2) < 1e-6);
  assert.ok(RADIUS_3KM2 > 977 && RADIUS_3KM2 < 978);
});

test('latLngToLocal maps Eiffel Tower origin to (0, 0) and round-trips accurately', () => {
  const origin = latLngToLocal(EIFFEL_ORIGIN.lat, EIFFEL_ORIGIN.lng);
  assert.equal(origin.x, 0);
  assert.equal(origin.z, 0);

  const troc = latLngToLocal(48.86205, 2.28825);
  // Palais de Chaillot is NW of Eiffel Tower (-X, -Z)
  assert.ok(troc.x < -300 && troc.z < -300);

  const back = localToLatLng(troc.x, troc.z);
  assert.ok(Math.abs(back.lat - 48.86205) < 1e-6);
  assert.ok(Math.abs(back.lng - 2.28825) < 1e-6);
});

test('Eiffel Tower parabolic profile narrows monotonically from 125m base to summit', () => {
  assert.equal(eiffelOuterHalfWidthAt(0), EIFFEL_SPECS.baseHalfWidth);
  let prev = eiffelOuterHalfWidthAt(0);
  for (let y = 10; y <= EIFFEL_SPECS.ironSummitY; y += 10) {
    const w = eiffelOuterHalfWidthAt(y);
    assert.ok(w < prev, `Width at ${y}m (${w}) should be less than previous (${prev})`);
    prev = w;
  }
  // Inner leg half-width is strictly inside outer half-width and converges to 0 above 155m
  assert.ok(eiffelInnerHalfWidthAt(0) < eiffelOuterHalfWidthAt(0));
  assert.equal(eiffelInnerHalfWidthAt(160), 0);
});

test('All curated Paris landmarks fall within the 3 km² zone radius', () => {
  assert.ok(PARIS_LANDMARKS.length >= 10);
  for (const lm of PARIS_LANDMARKS) {
    const d = distanceFromOrigin(lm.x, lm.z);
    assert.ok(
      d <= RADIUS_3KM2 + 25,
      `Landmark ${lm.name} at ${d.toFixed(1)}m exceeds 3 km² radius (${RADIUS_3KM2.toFixed(1)}m)`
    );
  }
});

test('Terrain elevation drops in Seine channel and rises toward Chaillot/Trocadéro hill', () => {
  // Eiffel Tower is at 0m datum
  assert.equal(terrainHeightAt(0, 0), 0);

  // Midpoint of Seine is recessed below quay walls
  const midSeine = SEINE_CENTERLINE[4];
  assert.ok(terrainHeightAt(midSeine.x, midSeine.z) < -4);
  assert.ok(sampleSeineProximity(midSeine.x, midSeine.z).dist < 5);

  // Palais de Chaillot sits elevated on Chaillot Hill
  const troc = latLngToLocal(48.86205, 2.28825);
  assert.ok(terrainHeightAt(troc.x, troc.z) > 10);
});

test('Camera presets contain finite 3D coordinates', () => {
  assert.ok(CAMERA_PRESETS.length >= 5);
  for (const p of CAMERA_PRESETS) {
    assert.ok(p.position.every(Number.isFinite));
    assert.ok(p.target.every(Number.isFinite));
  }
});
