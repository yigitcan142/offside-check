import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateConfidence, sourceReliability } from '../src/confidenceEngine.js';

const src = (key: string, tier: number, hits = 0, misses = 0) => ({
  key,
  tier,
  reliability: sourceReliability(tier, hits, misses)
});

test('güvenilirlik: başlangıç değeri seviyeye bağlı, geçmişle güncellenir', () => {
  assert.ok(sourceReliability(1) > sourceReliability(2));
  assert.ok(sourceReliability(2) > sourceReliability(3));
  assert.ok(sourceReliability(2, 10, 0) > sourceReliability(2));
  assert.ok(sourceReliability(2, 0, 10) < sourceReliability(2));
});

test('resmi kaynak + resmi duyuru = 100', () => {
  assert.equal(calculateConfidence({ sources: [src('kulup', 0)], stage: 'OFFICIAL' }), 100);
});

test('aşama yükseldikçe skor artar', () => {
  const score = (stage: any) => calculateConfidence({ sources: [src('a', 1)], stage });
  assert.ok(score('RUMOR') < score('INTEREST'));
  assert.ok(score('INTEREST') < score('ADVANCED'));
  assert.ok(score('ADVANCED') < score('DONE'));
  assert.ok(score('DONE') <= score('OFFICIAL'));
});

test('çapraz doğrulama skoru artırır', () => {
  const one = calculateConfidence({ sources: [src('a', 2)], stage: 'ADVANCED' });
  const two = calculateConfidence({ sources: [src('a', 2), src('b', 2)], stage: 'ADVANCED' });
  const three = calculateConfidence({ sources: [src('a', 2), src('b', 2), src('c', 2)], stage: 'ADVANCED' });
  assert.ok(one < two && two < three);
  // aynı kaynağı iki kez saymak doğrulama değildir
  assert.equal(calculateConfidence({ sources: [src('a', 2), src('a', 2)], stage: 'ADVANCED' }), one);
});

test('belirsiz dil düşürür, kesin dil artırır; söylenti 50 altında kalır', () => {
  const base = calculateConfidence({ sources: [src('a', 1)], stage: 'DONE' });
  assert.ok(calculateConfidence({ sources: [src('a', 1)], stage: 'DONE', hedged: true }) < base);
  assert.ok(calculateConfidence({ sources: [src('a', 1)], stage: 'DONE', certainLanguage: true }) > base);
  const rumor = calculateConfidence({
    sources: [src('a', 0), src('b', 1), src('c', 1)],
    stage: 'RUMOR',
    certainLanguage: true
  });
  assert.ok(rumor <= 49);
});

test('doğruluk geçmişi olan kaynak daha yüksek skor alır', () => {
  const clean = calculateConfidence({ sources: [src('a', 2, 12, 0)], stage: 'ADVANCED' });
  const bad = calculateConfidence({ sources: [src('a', 2, 0, 12)], stage: 'ADVANCED' });
  assert.ok(clean > bad);
});
