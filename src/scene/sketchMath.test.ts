import test from 'node:test';
import assert from 'node:assert/strict';
import { SketchLineCollector, createRng, isFiniteBuffer } from './sketchMath';

test('createRng produces deterministic sequence in [0, 1)', () => {
  const a = createRng(1889);
  const b = createRng(1889);
  for (let i = 0; i < 20; i++) {
    const va = a();
    const vb = b();
    assert.equal(va, vb);
    assert.ok(va >= 0 && va < 1);
  }
});

test('SketchLineCollector accumulates valid finite line segments across primitives', () => {
  const col = new SketchLineCollector(42);
  col.addSegment(0, 0, 0, 10, 20, 30);
  col.addInkStroke(0, 0, 0, 50, 0, 0, { overshoot: 0.5, jitter: 0.1, doublePass: true });
  col.addHorizontalCircle(0, 10, 0, 25, 16);
  col.addOrientedBox(100, 0, -50, 30, 20, 20, 0.5, {
    floors: 4,
    windowBays: 5,
    mansardHeight: 3.5,
  });
  col.addSketchTree(20, 0, 20, 12, 4);

  const buf = col.toFloat32Array();
  assert.equal(buf.length % 6, 0);
  assert.equal(col.segmentCount, buf.length / 6);
  assert.ok(col.segmentCount > 50);
  assert.equal(isFiniteBuffer(buf), true);
});

test('High-detail Haussmannian building, streetlamp, and moored barge emit valid finite geometry', () => {
  const primary = new SketchLineCollector(101);
  const fine = new SketchLineCollector(102);
  const faint = new SketchLineCollector(103);

  primary.addHaussmannBuilding(200, 0, -150, 36, 21, 14, 0.78, {
    floors: 6,
    mansardHeight: 3.8,
    detailTier: 'hero',
    balconyFloors: [2, 5],
    cornerRotunda: true,
    crossHatchShadowFace: true,
    fineTarget: fine,
    faintTarget: faint,
  });

  fine.addParisStreetLamp(10, 0, 10, 5.4);
  fine.addMooredBarge(-50, -5, -80, 34, 6.2, 0.5, faint);

  assert.ok(primary.segmentCount > 60, 'Primary Haussmann silhouette + balconies + rotunda expected');
  assert.ok(fine.segmentCount > 300, 'Fine French windows, dormers, chimneys, lamp & barge expected');
  assert.ok(faint.segmentCount > 80, 'Faint window mullions & shadow cross-hatching expected');

  assert.equal(isFiniteBuffer(primary.toFloat32Array()), true);
  assert.equal(isFiniteBuffer(fine.toFloat32Array()), true);
  assert.equal(isFiniteBuffer(faint.toFloat32Array()), true);
});

test('addInkStroke ignores degenerate zero-length strokes', () => {
  const col = new SketchLineCollector(7);
  col.addInkStroke(5, 5, 5, 5, 5, 5, { overshoot: 1, doublePass: true, jitter: 0.5 });
  assert.equal(col.segmentCount, 0);
});
