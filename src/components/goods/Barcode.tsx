import { encodeLotBarcode } from "@/lib/barcode";

/**
 * Symbole GS1-128 d'un lot, rendu en SVG. Le SVG plutôt que le canvas :
 * l'impression reste nette quelle que soit la résolution, ce qui décide
 * de la lisibilité d'un code-barres par la douchette.
 */
export function LotBarcode({
  lotNumber,
  expiryDate,
  internalRef,
  /* 2 px par module étroit : en-dessous, les imprimantes laser bavent et le
     symbole devient illisible. */
  moduleWidth = 2,
  height = 38,
}: {
  lotNumber: string;
  expiryDate: string;
  internalRef: string | null;
  moduleWidth?: number;
  height?: number;
}) {
  const payload = encodeLotBarcode({ lotNumber, expiryDate, internalRef });

  if (!payload) {
    return (
      <p className="text-[8px] italic text-[#999]">
        Code-barres indisponible : lot ou date de péremption invalide.
      </p>
    );
  }

  const bars: { x: number; width: number }[] = [];
  let x = 0;
  payload.modules.forEach((width, index) => {
    /* Les motifs Code 128 alternent barre/espace en commençant par une barre. */
    if (index % 2 === 0) bars.push({ x, width });
    x += width;
  });

  const totalWidth = payload.width * moduleWidth;

  return (
    <div>
      <svg
        viewBox={`0 0 ${payload.width} ${height}`}
        width={totalWidth}
        height={height}
        role="img"
        aria-label={`Code-barres GS1-128 : ${payload.humanReadable}`}
        shapeRendering="crispEdges"
        style={{ display: "block" }}
      >
        <rect width={payload.width} height={height} fill="#fff" />
        {bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x}
            y={0}
            width={bar.width}
            height={height}
            fill="#000"
          />
        ))}
      </svg>
      <p className="tnum mt-0.5 text-center text-[7px] leading-none text-black">
        {payload.humanReadable}
      </p>
    </div>
  );
}
