import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          borderRadius: 96,
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 9999,
            border: "18px solid rgba(34,197,94,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "radial-gradient(circle at 30% 25%, rgba(34,197,94,0.35), rgba(21,128,61,0.18))",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 9999,
              background: "#e5e7eb",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
