import { env } from "@/server/env";
import { getSite } from "@/server/site";
import { getSiteUrls } from "@/lib/site-urls";
import { DemoShowcase } from "@/components/demo/demo-showcase";
import { SmoothScroll } from "@/components/ui/smooth-scroll";

export const metadata = {
  title: "Live Showcase | DinePulse by Intallo",
  description:
    "Interactive split-screen demo of DinePulse: QR table guest ordering alongside a live digital kitchen display board.",
};

export default function DemoPage() {
  const isDemoMode = env.DEMO_MODE === "true";
  const site = getSite();
  const urls = getSiteUrls(site);

  return (
    <SmoothScroll>
      <DemoShowcase
        isDemoMode={isDemoMode}
        kitchenUrl={urls.kitchen}
        managerUrl={urls.manager}
      />
    </SmoothScroll>
  );
}
