import { env } from "@/server/env";
import { DemoShowcase } from "@/components/demo/demo-showcase";
import { SmoothScroll } from "@/components/ui/smooth-scroll";

export const metadata = {
  title: "Live Showcase | DinePulse by Intallo",
  description:
    "Interactive split-screen demo of DinePulse: QR table guest ordering alongside a live digital kitchen display board.",
};

export default function DemoPage() {
  const isDemoMode = env.DEMO_MODE === "true";

  return (
    <SmoothScroll>
      <DemoShowcase isDemoMode={isDemoMode} />
    </SmoothScroll>
  );
}
