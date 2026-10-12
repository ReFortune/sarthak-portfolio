/** One instruction, worded for the pointer in use: "hover / click" with a mouse, "tap" on a touch screen (pure CSS — no hydration flash). */
export default function PointerText({ fine, coarse }: { fine: string; coarse: string }) {
  return (
    <>
      <span className="[@media(pointer:coarse)]:hidden">{fine}</span>
      <span className="hidden [@media(pointer:coarse)]:inline">{coarse}</span>
    </>
  );
}
