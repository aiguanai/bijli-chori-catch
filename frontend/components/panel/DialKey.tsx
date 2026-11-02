import { CursorClick } from "@phosphor-icons/react/dist/ssr";
import { Dial, Lamp } from "@/components/instruments/Dial";

/** How to read the wall, drawn with the real parts. */
export function DialKey({ threshold }: { threshold: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule px-4 py-2 text-sm">
      <span className="font-semibold">How to read a dial</span>
      <span className="flex items-center gap-2">
        <Dial value={0.8} threshold={threshold} size={44} title="Example dial" />
        Needle further right means higher risk
      </span>
      <span className="flex items-center gap-2">
        <Lamp on size={9} />
        Red dot: at or above your alert level
      </span>
      <span className="flex items-center gap-2">
        <CursorClick size={16} weight="bold" aria-hidden />
        Click a dial to read it
      </span>
    </div>
  );
}
