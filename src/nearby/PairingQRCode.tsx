import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';
export function PairingQRCode({ value }: { value: string }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value, 'Byte');
    qr.make();
    const modules = qr.getModuleCount();
    const cells: string[] = [];
    for (let row = 0; row < modules; row++)
      for (let column = 0; column < modules; column++)
        if (qr.isDark(row, column))
          cells.push(`M${column + 4} ${row + 4}h1v1h-1z`);
    return { count: modules + 8, path: cells.join('') };
  }, [value]);
  return (
    <Svg
      width={240}
      height={240}
      viewBox={`0 0 ${count} ${count}`}
      accessibilityLabel="Private nearby pairing QR code"
      accessibilityRole="image"
    >
      <Rect width={count} height={count} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
