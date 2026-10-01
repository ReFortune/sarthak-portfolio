/**
 * Renders "40 km" as a display-caps number with a lowercase serif unit.
 * Only splits when the value *ends* in a pure-letter unit after a number
 * ("7 yr", "<500 g", "3.7 W"); identifiers like "ESP32", "CDR", "$35,000" stay intact.
 */
export default function MetricValue({ value, className = "" }: { value: string; className?: string }) {
  const m = /^(.*\d[\d.,]*)\s+([A-Za-zµ°%]+)$/.exec(value) ?? /^(.*\d[\d.,]*)([A-Za-zµ°%]{1,3})$/.exec(value);
  const looksLikeId = /^[A-Za-z]+\d+$/.test(value); // ESP32, CP24
  if (!m || looksLikeId) return <span className={`whitespace-nowrap ${className}`}>{value}</span>;
  const [, num, unit] = m;
  return (
    <span className={`whitespace-nowrap ${className}`}>
      {num}
      <span className="serif ml-[0.12em] text-[0.52em] normal-case tracking-normal text-bone-dim">{unit}</span>
    </span>
  );
}
