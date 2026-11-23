import qrcode from '../lib/review-qr.js?v=20261123-checkup-opening-names';

export const CHECKUP_URL = 'https://4chess.cc/analysis/?tab=checkup';

export function canvasPng(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export function downloadPng(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copyPng(blob) {
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function showCopyField(field, value) {
  field.value = value;
  field.hidden = false;
  field.focus();
  field.select();
}

export function shareQr(target) {
  const qr = qrcode(0, 'M');
  qr.addData(target, 'Byte');
  qr.make();
  return qr;
}

export function drawShareQr(ctx, code, right, y, maxSize) {
  const size = code.getModuleCount();
  const scale = Math.floor(maxSize / (size + 8));
  const pixels = (size + 8) * scale;
  const x = right - pixels;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, pixels, pixels);
  ctx.fillStyle = '#111';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (code.isDark(row, col)) ctx.fillRect(x + (col + 4) * scale, y + (row + 4) * scale, scale, scale);
    }
  }
}
