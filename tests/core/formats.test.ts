import { expect, test } from 'vitest';
import { isSupportedImage } from '../../src/core/formats';

test.each(['a.JPG', 'b.webp', 'c.avif', 'd.bmp', 'e.png', 'f.jpeg'])('%s is supported', (n) => {
  expect(isSupportedImage(n)).toBe(true);
});

test.each(['g.gif', 'h.GIF', 'i.txt', 'noext', '.jpg'])('%s is not supported', (n) => {
  expect(isSupportedImage(n)).toBe(false);
});
