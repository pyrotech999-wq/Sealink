interface Props {
  direction?: number;
}

export default function WindGauge({
  direction = 0,
}: Props) {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20">

      <span className="absolute top-1 text-[9px] text-white">
        N
      </span>

      <div
        className="text-white text-xl"
        style={{
          transform: `rotate(${direction}deg)`,
        }}
      >
        ▲
      </div>
    </div>
  );
}