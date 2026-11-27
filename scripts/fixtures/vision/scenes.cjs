const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function loadBoard(name) {
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`)));
  const rgba = zlib.inflateSync(fs.readFileSync(path.join(__dirname, `${name}.rgba.zlib`)));
  return { ...metadata, data: new Uint8ClampedArray(rgba) };
}

function roundedScreenshot(fixture) {
  const scene = { width: 1400, height: 950 };
  scene.data = new Uint8ClampedArray(scene.width * scene.height * 4);
  const left = 180, top = 130, radius = 40;
  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      const dx = x - left, dy = y - top;
      const clipX = Math.max(0, radius - Math.min(dx, fixture.width - 1 - dx));
      const clipY = Math.max(0, radius - Math.min(dy, fixture.height - 1 - dy));
      const index = (y * scene.width + x) * 4;
      const inside = dx >= 0 && dy >= 0 && dx < fixture.width && dy < fixture.height;
      if (inside && clipX ** 2 + clipY ** 2 < radius ** 2) {
        const pixel = (dy * fixture.width + dx) * 4;
        scene.data.set(fixture.data.subarray(pixel, pixel + 4), index);
      } else {
        let gray = 31;
        if (x >= left - 19 && x < left - 2 && dy >= 0 && dy < fixture.height)
          gray = dy < fixture.height * 0.56 ? 5 : 240;
        if (dx >= fixture.width + 10 && x < scene.width - 30 &&
            dy >= 32 && y < scene.height - 30) {
          gray = y % 27 < 10 && x % 43 > 9 ? 235 : 52;
          if (x % 100 < 12 || y % 83 < 12) gray = 245;
        }
        scene.data.set([gray, gray, gray, 255], index);
      }
    }
  }
  return scene;
}

// Resample like the mini-program's capped recognition canvas.
function resizeImage(image, width) {
  const height = Math.round(width * image.height / image.width);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = (y + 0.5) * image.height / height - 0.5;
    const row = Math.floor(sourceY);
    const wy = sourceY - row;
    for (let x = 0; x < width; x++) {
      const sourceX = (x + 0.5) * image.width / width - 0.5;
      const col = Math.floor(sourceX);
      const wx = sourceX - col;
      const top = (row * image.width + col) * 4;
      const bottom = top + image.width * 4;
      const dest = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        data[dest + c] = (image.data[top + c] * (1 - wx) + image.data[top + c + 4] * wx) * (1 - wy) +
          (image.data[bottom + c] * (1 - wx) + image.data[bottom + c + 4] * wx) * wy;
      }
    }
  }
  return { width, height, data };
}

function angledBoard(fixture) {
  const width = 1040, height = 950, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([31, 31, 31, 255], i);
  // Trapezoid with the far edge receding. Invert the perspective to sample the board.
  for (let y = 115; y < 815; y++) {
    const v = (y + 0.5 - 115) / 700;
    const left = 194 - 40 * v, right = 848 + 40 * v;
    const sourceY = Math.floor(v * 734 / (654 + 80 * v) * fixture.height);
    for (let x = Math.ceil(left); x < right - 0.5; x++) {
      const sourceX = Math.floor((x + 0.5 - left) / (right - left) * fixture.width);
      const offset = (sourceY * fixture.width + sourceX) * 4;
      data.set(fixture.data.subarray(offset, offset + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function scanCases() {
  const board = loadBoard('board-endgame');
  const black = loadBoard('black-coordinates');
  const rounded = roundedScreenshot(board);
  return [
    { name: 'screenshot', image: board, boardFen: board.board, hasBoard: true, needsReview: false },
    { name: 'black coordinates', image: black, boardFen: black.expectedBoard, hasBoard: true, needsReview: false },
    { name: 'rounded corners', image: rounded, boardFen: board.board, hasBoard: true, needsReview: false,
      preprocessing: 'roundedCorners' },
    { name: 'rounded corners after resizing', image: resizeImage(rounded, 1200), boardFen: board.board,
      hasBoard: true, needsReview: false, preprocessing: 'roundedCorners' },
    { name: 'angled board still needs review', image: angledBoard(board), boardFen: '1K6/2Q3r1/1P6/1p6/2pk4/3p4/8/7B',
      hasBoard: true, needsReview: true },
    { name: 'blank', image: { width: 320, height: 320, data: new Uint8ClampedArray(320 * 320 * 4).fill(128) },
      boardFen: '', hasBoard: false, needsReview: true }
  ];
}

module.exports = { loadBoard, roundedScreenshot, resizeImage, scanCases };
