import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRevealOriginOffset,
  computeSpecimenCameraFrame,
  createBridgeElement,
  createEiffelTowerElement,
  createHaussmannBuildingElement,
  createMetroTrainElement,
  createMonumentElement,
  createParisTreeElement,
  createRiverBargeElement,
  createRiverShipElement,
  landmarkIdToInspectableElement,
} from './elementCatalog';

test('computeSpecimenCameraFrame produces finite, well-framed orbit distances for tall and wide elements', () => {
  const towerFrame = computeSpecimenCameraFrame(132, 332, 132);
  assert.ok(towerFrame.position.every(Number.isFinite));
  assert.ok(towerFrame.target.every(Number.isFinite));
  assert.ok(towerFrame.minDistance > 0 && towerFrame.minDistance < towerFrame.maxDistance);
  assert.ok(towerFrame.plinthRadius > 60);

  const treeFrame = computeSpecimenCameraFrame(11, 14, 11);
  assert.ok(treeFrame.position.every(Number.isFinite));
  assert.ok(treeFrame.target[1] > 5 && treeFrame.target[1] < 8);
  assert.ok(treeFrame.minDistance >= 2.5);
});

test('computeRevealOriginOffset clamps click origin cleanly within viewport bounds', () => {
  const center = computeRevealOriginOffset(720, 450, 1440, 900);
  assert.equal(center.x, 0);
  assert.equal(center.y, 0);

  const corner = computeRevealOriginOffset(1440, 0, 1440, 900);
  assert.ok(corner.x > 0 && corner.x <= 1440 * 0.34);
  assert.ok(corner.y < 0 && corner.y >= -900 * 0.34);
});

test('Element factories create valid architectural metadata for every clickable Paris element type', () => {
  const samples = [
    createEiffelTowerElement(),
    createHaussmannBuildingElement({
      index: 3,
      width: 32,
      height: 21.5,
      depth: 12,
      floors: 6,
      mansardHeight: 3.6,
      cornerRotunda: true,
      arrondissement: '7th Arrondissement',
    }),
    createRiverShipElement(0),
    createRiverBargeElement({ index: 1, length: 34, beam: 6.2, portName: 'Port de la Bourdonnais' }),
    createParisTreeElement({ index: 2, height: 13, canopyRadius: 4.8, locationLabel: 'Champ de Mars' }),
    createBridgeElement('pont-iena'),
    createBridgeElement('pont-bir-hakeim'),
    createMetroTrainElement(),
    createMonumentElement('holy-trinity'),
    landmarkIdToInspectableElement('trocadero'),
  ];

  for (const el of samples) {
    assert.ok(el.id.length > 0);
    assert.ok(el.title.length > 0);
    assert.ok(el.specs.length >= 4);
  }
});
