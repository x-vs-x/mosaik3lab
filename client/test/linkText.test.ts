import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teileInLinks } from '../src/lib/linkText';

test('Text ohne Link bleibt ein Stück', () => {
  assert.deepEqual(teileInLinks('Nur Text.'), [{ text: 'Nur Text.' }]);
  assert.deepEqual(teileInLinks(''), []);
});

test('http(s)- und www-Links werden erkannt, Satzzeichen am Ende gehören nicht dazu', () => {
  assert.deepEqual(teileInLinks('Siehe https://beispiel.de/teil?id=3.'), [
    { text: 'Siehe ' },
    { text: 'https://beispiel.de/teil?id=3', href: 'https://beispiel.de/teil?id=3' },
    { text: '.' },
  ]);
  assert.deepEqual(teileInLinks('Bestellen (www.shop.de/taster), dann drucken'), [
    { text: 'Bestellen (' },
    { text: 'www.shop.de/taster', href: 'https://www.shop.de/taster' },
    { text: '), dann drucken' },
  ]);
  assert.deepEqual(teileInLinks('a http://x.de b https://y.de!'), [
    { text: 'a ' },
    { text: 'http://x.de', href: 'http://x.de' },
    { text: ' b ' },
    { text: 'https://y.de', href: 'https://y.de' },
    { text: '!' },
  ]);
});

test('Klammern im Link bleiben erhalten, andere Schemata nicht', () => {
  assert.deepEqual(teileInLinks('https://de.wikipedia.org/wiki/Taster_(Elektrotechnik)'), [
    { text: 'https://de.wikipedia.org/wiki/Taster_(Elektrotechnik)', href: 'https://de.wikipedia.org/wiki/Taster_(Elektrotechnik)' },
  ]);
  assert.deepEqual(teileInLinks('javascript:alert(1) und ftp://x.de'), [{ text: 'javascript:alert(1) und ftp://x.de' }]);
  assert.deepEqual(teileInLinks('nur https:// allein'), [{ text: 'nur https:// allein' }]);
});
