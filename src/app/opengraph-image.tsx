import { ImageResponse } from "next/og";

export const alt = "DinePulse by Intallo | Smart QR Dining & Real-Time KDS";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          backgroundColor: "#FAF7F2",
          padding: "60px 80px",
          fontFamily: "sans-serif",
          border: "16px solid #882914",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: "#882914",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FAF7F2",
              fontSize: "28px",
              fontWeight: "bold",
            }}
          >
            D
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              color: "#882914",
              letterSpacing: "-0.5px",
            }}
          >
            DinePulse
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#6E645A",
              padding: "4px 12px",
              borderRadius: "20px",
              border: "1px solid #D5CBBF",
              backgroundColor: "#FFF",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Concept Preview by Intallo
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              fontSize: "56px",
              fontWeight: "bold",
              color: "#1B1714",
              lineHeight: 1.15,
              letterSpacing: "-1px",
              maxWidth: "960px",
            }}
          >
            Smart QR Table Ordering & Real-Time Kitchen Operations
          </div>
          <div
            style={{
              fontSize: "24px",
              color: "#6E645A",
              lineHeight: 1.4,
              maxWidth: "880px",
            }}
          >
            High-precision digital menus, integer-safe billing, and zero-latency kitchen display system designed for modern Indian dining.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            borderTop: "2px solid #E8E2D9",
            paddingTop: "24px",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#882914",
            }}
          >
            intallo.in/contact
          </div>
          <div
            style={{
              fontSize: "16px",
              color: "#998D7F",
            }}
          >
            Masala Lane Flagship Demo
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
