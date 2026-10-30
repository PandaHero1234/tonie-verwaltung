// Liest die wichtigsten Felder einer Flipper-Zero-NFC-Datei.
export function parseNfc(text) {
  const get = (key) => {
    const m = String(text).match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  return {
    valid: /^Filetype:\s*Flipper NFC device/m.test(text),
    uid: get('UID'),
    type: get('Device type'),
  };
}
