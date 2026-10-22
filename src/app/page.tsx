import * as fs from "node:fs";
import * as path from "node:path";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Clock,
  MapPin,
  Smartphone,
  Flame,
  ChefHat,
  ArrowDown,
  Compass,
} from "lucide-react";
import { SmoothScroll } from "@/components/ui/smooth-scroll";
import { Reveal } from "@/components/ui/reveal";
import { HeroMedia } from "@/components/landing/hero-media";
import { SignatureCarousel, type SignatureDishItem } from "@/components/landing/signature-carousel";
import { resolveSiteUrl } from "@/lib/site-urls";

export default function HomePage() {
  const root = process.cwd();

  const kitchenUrl = resolveSiteUrl("kitchen", "/kitchen");
  const managerUrl = resolveSiteUrl("manager", "/admin");

  // Check on server whether custom food photos or video exist on disk
  const hasHeroVideo = fs.existsSync(path.resolve(root, "public/media/hero.mp4"));
  const hasHeroPhoto = fs.existsSync(path.resolve(root, "public/images/hero.jpg"));
  const hasHeroPoster = fs.existsSync(path.resolve(root, "public/media/hero-poster.jpg"));
  const hasStoryPhoto = fs.existsSync(path.resolve(root, "public/images/story.jpg"));

  // 6 Signature Dishes for Section 03
  const signatureDishes: SignatureDishItem[] = [
    {
      id: "dish-1",
      slug: "butter-chicken",
      name: "Old Delhi Butter Chicken",
      oneLine: "Charcoal-smoked chicken simmered in velvet satin tomato gravy, dairy butter, and fenugreek.",
      price: "₹485",
      isVeg: false,
      imageSrc: fs.existsSync(path.resolve(root, "public/images/dishes/butter-chicken.jpg"))
        ? "/images/dishes/butter-chicken.jpg"
        : "/images/dish-placeholder.svg",
      isOptimized: fs.existsSync(path.resolve(root, "public/images/dishes/butter-chicken.jpg")),
    },
    {
      id: "dish-2",
      slug: "dal-makhani",
      name: "Dal Makhani 24h",
      oneLine: "Whole black urad lentils slow-cooked overnight with vine-ripened tomatoes and white makkhan.",
      price: "₹365",
      isVeg: true,
      imageSrc: fs.existsSync(path.resolve(root, "public/images/dishes/dal-makhani.jpg"))
        ? "/images/dishes/dal-makhani.jpg"
        : "/images/dish-placeholder.svg",
      isOptimized: fs.existsSync(path.resolve(root, "public/images/dishes/dal-makhani.jpg")),
    },
    {
      id: "dish-3",
      slug: "paneer-tikka",
      name: "Paneer Tikka Shashlik",
      oneLine: "Tandoor-charred cottage cheese cubes with bell peppers, onion petals, and yellow chilli marinade.",
      price: "₹365",
      isVeg: true,
      imageSrc: fs.existsSync(path.resolve(root, "public/images/dishes/paneer-tikka.jpg"))
        ? "/images/dishes/paneer-tikka.jpg"
        : "/images/dish-placeholder.svg",
      isOptimized: fs.existsSync(path.resolve(root, "public/images/dishes/paneer-tikka.jpg")),
    },
    {
      id: "dish-4",
      slug: "gosht-dum-biryani",
      name: "Awadhi Gosht Dum Biryani",
      oneLine: "Succulent cuts of lamb marinated overnight, dum cooked in brass degh with long-grain rice.",
      price: "₹585",
      isVeg: false,
      imageSrc: fs.existsSync(path.resolve(root, "public/images/dishes/gosht-dum-biryani.jpg"))
        ? "/images/dishes/gosht-dum-biryani.jpg"
        : "/images/dish-placeholder.svg",
      isOptimized: fs.existsSync(path.resolve(root, "public/images/dishes/gosht-dum-biryani.jpg")),
    },
    {
      id: "dish-5",
      slug: "truffle-cheddar-naan",
      name: "Truffle & Aged Cheddar Naan",
      oneLine: "Crisp tandoori naan stuffed with aged cheddar and finished with cold-pressed truffle oil.",
      price: "₹185",
      isVeg: true,
      imageSrc: fs.existsSync(path.resolve(root, "public/images/dishes/truffle-cheddar-naan.jpg"))
        ? "/images/dishes/truffle-cheddar-naan.jpg"
        : "/images/dish-placeholder.svg",
      isOptimized: fs.existsSync(path.resolve(root, "public/images/dishes/truffle-cheddar-naan.jpg")),
    },
    {
      id: "dish-6",
      slug: "mango-lassi",
      name: "Alphonso & Cardamom Lassi",
      oneLine: "Churned thick yogurt blended with Ratnagiri mango pulp and freshly ground green cardamom.",
      price: "₹175",
      isVeg: true,
      imageSrc: fs.existsSync(path.resolve(root, "public/images/dishes/mango-lassi.jpg"))
        ? "/images/dishes/mango-lassi.jpg"
        : "/images/dish-placeholder.svg",
      isOptimized: fs.existsSync(path.resolve(root, "public/images/dishes/mango-lassi.jpg")),
    },
  ];

  return (
    <SmoothScroll>
      <div className="flex flex-col min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] overflow-x-hidden selection:bg-[#D97706]/20 selection:text-[#D97706]">
        {/* Navigation Bar */}
        <header className="sticky top-0 z-50 bg-[var(--bg-app)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-8 py-3.5 transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <Link href="/" className="flex items-baseline gap-2.5 group">
              <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[var(--primary)] group-hover:opacity-90 transition-opacity">
                Masala Lane
              </span>
              <span className="hidden sm:inline text-[11px] font-mono tracking-widest text-[var(--text-muted)] uppercase">
                Bengaluru
              </span>
            </Link>

            <div className="flex items-center gap-3 sm:gap-5">
              <Link
                href="#signature-dishes"
                className="hidden md:inline-flex items-center text-xs font-semibold tracking-wider uppercase text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors min-h-[44px]"
              >
                Signatures
              </Link>
              <Link
                href="#table-ordering"
                className="hidden md:inline-flex items-center text-xs font-semibold tracking-wider uppercase text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors min-h-[44px]"
              >
                Dine In
              </Link>
              <Link
                href="/order"
                data-testid="header-order-btn"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold tracking-wide uppercase transition-all shadow-xs min-h-[44px]"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Order at Table</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full overflow-x-hidden">
          {/* ================================================================ */}
          {/* 00 / HERO: Full-viewport Editorial Showcase */}
          {/* ================================================================ */}
          <section className="relative min-h-[100dvh] w-full flex flex-col justify-between overflow-hidden px-4 sm:px-8 pt-24 pb-12 sm:pb-16">
            {/* Background Layer: Video or Photo with Espresso Gradient Contrast */}
            <div className="absolute inset-0 z-0 overflow-hidden">
              <HeroMedia
                hasVideo={hasHeroVideo}
                videoSrc="/media/hero.mp4"
                posterSrc={hasHeroPoster ? "/media/hero-poster.jpg" : "/media/hero-poster.svg"}
                photoSrc={hasHeroPhoto ? "/images/hero.jpg" : "/images/hero-placeholder.svg"}
                isPhotoOptimized={hasHeroPhoto}
              />
              {/* Dark Espresso Gradient Overlay for Flawless WCAG AA Text Contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1F1A18] via-[#2E2723]/75 to-[#1F1A18]/60 z-10" />
              <div className="absolute inset-0 bg-[#2E2723]/35 mix-blend-multiply z-10" />
            </div>

            {/* Spacer for vertical balance */}
            <div className="relative z-20 shrink-0" />

            {/* Main Center Content */}
            <div className="relative z-20 max-w-5xl mx-auto w-full text-center space-y-6 sm:space-y-8 my-auto">
              <Reveal delay={0.05}>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[#FAF7F2]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D97706] animate-pulse" />
                  <span className="eyebrow text-xs sm:text-sm font-semibold tracking-wider text-[#FAF7F2]">
                    00 / Regional Indian · Bengaluru
                  </span>
                </div>
              </Reveal>

              <Reveal delay={0.15}>
                <h1 className="font-serif text-[#FAF7F2] uppercase font-bold tracking-tight drop-shadow-md leading-[0.92] text-[clamp(3rem,9vw,9rem)]">
                  Masala Lane
                </h1>
              </Reveal>

              <Reveal delay={0.35}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                  <Link
                    href="/order"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-[#D97706] hover:bg-[#B45309] text-white text-xs sm:text-sm font-semibold tracking-wider uppercase transition-all shadow-md active:scale-98 min-h-[48px]"
                  >
                    <span>Order at Table</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <a
                    href="#signature-dishes"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/25 text-[#FAF7F2] text-xs sm:text-sm font-semibold tracking-wider uppercase transition-all min-h-[48px]"
                  >
                    <span>View signature dishes</span>
                  </a>

                  <a
                    href="#table-ordering"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md text-[#D1C5B8] hover:text-[#FAF7F2] text-xs sm:text-sm font-medium tracking-wider uppercase transition-all min-h-[48px]"
                  >
                    <span>Dine-In QR Ordering</span>
                  </a>
                </div>
              </Reveal>
            </div>

            {/* Bottom Scroll Cue */}
            <div className="relative z-20 flex justify-center pt-8">
              <Reveal delay={0.45}>
                <a
                  href="#marquee-ticker"
                  className="group inline-flex flex-col items-center gap-1.5 text-[#D1C5B8] hover:text-[#FAF7F2] transition-colors"
                >
                  <span className="eyebrow text-[9px] tracking-[0.25em] text-[#D1C5B8] group-hover:text-[#FAF7F2]">
                    Scroll
                  </span>
                  <ArrowDown className="h-3.5 w-3.5 animate-bounce text-[#D97706]" />
                </a>
              </Reveal>
            </div>
          </section>

          {/* ================================================================ */}
          {/* 01 / MARQUEE TICKER: Pure CSS Infinite Horizontal Marquee */}
          {/* ================================================================ */}
          <section id="marquee-ticker" className="border-y border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 py-4 overflow-hidden select-none">
            <div className="marquee flex items-center gap-8 whitespace-nowrap text-xs sm:text-sm font-mono font-medium tracking-widest uppercase text-[var(--text-secondary)]">
              <span>Tandoor</span>
              <span className="text-[#D97706]">◆</span>
              <span>Saffron</span>
              <span className="text-[#D97706]">◆</span>
              <span>Ghee</span>
              <span className="text-[#D97706]">◆</span>
              <span>Curry leaf</span>
              <span className="text-[#D97706]">◆</span>
              <span>Jaggery</span>
              <span className="text-[#D97706]">◆</span>
              <span>Coastal</span>
              <span className="text-[#D97706]">◆</span>
              <span>Charcoal</span>
              <span className="text-[#D97706]">◆</span>
              <span>Tandoor</span>
              <span className="text-[#D97706]">◆</span>
              <span>Saffron</span>
              <span className="text-[#D97706]">◆</span>
              <span>Ghee</span>
              <span className="text-[#D97706]">◆</span>
              <span>Curry leaf</span>
              <span className="text-[#D97706]">◆</span>
              <span>Jaggery</span>
              <span className="text-[#D97706]">◆</span>
              <span>Coastal</span>
              <span className="text-[#D97706]">◆</span>
              <span>Charcoal</span>
              <span className="text-[#D97706]">◆</span>
            </div>
          </section>

          {/* ================================================================ */}
          {/* 02 / STORY: Two Columns with Pull-Quote & Tall Photo Offset */}
          {/* ================================================================ */}
          <section className="py-24 sm:py-32 px-4 sm:px-8 max-w-7xl mx-auto w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
              {/* Column 1: Editorial Pull-Quote & Narrative */}
              <div className="lg:col-span-7 space-y-8">
                <Reveal>
                  <span className="eyebrow text-sm sm:text-base md:text-lg font-bold tracking-wider text-[#D97706]">
                    02 / Culinary Heritage
                  </span>
                </Reveal>

                <Reveal delay={0.1}>
                  <blockquote className="font-serif text-2xl sm:text-3xl md:text-4xl italic font-normal text-[var(--text-primary)] leading-[1.25]">
                    &ldquo;We believe in the slow alchemy of charcoal—where heritage gravies simmer overnight in copper vessels, and clay tandoors caramelize marinade into memory.&rdquo;
                  </blockquote>
                </Reveal>

                <Reveal delay={0.2} className="space-y-4 text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                  <p>
                    Rooted in the royal bawarchikhana traditions of Lucknow and the smoky sigdi street grills of Old Delhi, Masala Lane marries authentic regional craft with Bengaluru&apos;s cosmopolitan palate.
                  </p>
                  <p>
                    Every spice blend is freshly stone-pounded. Every biryani degh is sealed with whole wheat dough under slow dum embers. And every table is equipped with instant, app-free digital ordering for effortless fine dining.
                  </p>
                </Reveal>

                <Reveal delay={0.3} className="pt-2">
                  <div className="grid grid-cols-3 gap-6 pt-6 border-t border-[var(--border-subtle)]">
                    <div>
                      <span className="font-serif text-2xl sm:text-3xl font-bold text-[var(--primary)]">24h</span>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mt-1">
                        Dal Makhani Simmer
                      </p>
                    </div>
                    <div>
                      <span className="font-serif text-2xl sm:text-3xl font-bold text-[var(--primary)]">480°C</span>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mt-1">
                        Clay Tandoor Heat
                      </p>
                    </div>
                    <div>
                      <span className="font-serif text-2xl sm:text-3xl font-bold text-[var(--primary)]">100%</span>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mt-1">
                        App-Free Table Tap
                      </p>
                    </div>
                  </div>
                </Reveal>
              </div>

              {/* Column 2: Tall Photo with Editorial Offset */}
              <Reveal delay={0.2} className="lg:col-span-5">
                <div className="relative mx-auto max-w-md lg:max-w-none">
                  {/* Subtle Layered Offset Border Accent */}
                  <div className="absolute -inset-2.5 rounded-[var(--radius-xl)] border border-[#D97706]/20 bg-[#FAF7F2]/5 transform rotate-1 pointer-events-none" />

                  <div className="relative aspect-[3/4] w-full rounded-[var(--radius-xl)] overflow-hidden shadow-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                    <Image
                      src={hasStoryPhoto ? "/images/story.jpg" : "/images/story-placeholder.svg"}
                      alt="Heritage recipe reduction bubbling over slow charcoal"
                      fill
                      loading="lazy"
                      sizes="(max-width: 1024px) 90vw, 40vw"
                      unoptimized={!hasStoryPhoto}
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 text-white">
                      <span className="eyebrow text-[10px] text-amber-300 font-semibold">
                        The Heritage Archive
                      </span>
                      <p className="font-serif text-sm sm:text-base italic font-medium mt-1">
                        Slow-simmered regional sauces, perfected over generations.
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ================================================================ */}
          {/* 03 / SIGNATURE DISHES: Horizontal Scroll-Snap Row of Six Cards */}
          {/* ================================================================ */}
          <section id="signature-dishes" className="py-24 sm:py-32 px-4 sm:px-8 bg-[var(--bg-subtle)]/50 border-y border-[var(--border-subtle)] w-full">
            <div className="max-w-7xl mx-auto space-y-10">
              <Reveal className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-2">
                  <span className="eyebrow text-sm sm:text-base md:text-lg font-bold tracking-wider text-[#D97706]">
                    {"03 / Chef's Signatures"}
                  </span>
                  <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)]">
                    Flavours Carved in Ember
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-sm">
                  Swipe horizontally or use arrow buttons to explore our six signature guest favorites.
                </p>
              </Reveal>

              {/* Scroll-Snap Six Card Carousel */}
              <SignatureCarousel dishes={signatureDishes} />
            </div>
          </section>

          {/* ================================================================ */}
          {/* 04 / HOW IT WORKS: Ember Dark Band with Three Numbered Steps */}
          {/* ================================================================ */}
          <section id="table-ordering" className="ember-section py-24 sm:py-32 px-4 sm:px-8 border-y border-[var(--ember-border)] w-full">
            <div className="max-w-7xl mx-auto space-y-16">
              <Reveal className="max-w-2xl space-y-3">
                <span className="eyebrow text-base sm:text-lg md:text-xl font-bold tracking-wider text-[#D97706]">
                  04 / Effortless Hospitality
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#FAF7F2] tracking-tight">
                  How DinePulse Works
                </h2>
                <p className="text-sm sm:text-base text-[#D1C5B8] leading-relaxed">
                  Three simple steps between your table and the tandoor. Zero downloads, zero waiting for the bill.
                </p>
              </Reveal>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Step 1 */}
                <Reveal delay={0.1} className="p-8 rounded-[var(--radius-xl)] bg-[#3B332E] border border-[var(--ember-border)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-12 w-12 rounded-full bg-[#D97706]/15 flex items-center justify-center text-[#D97706]">
                      <Smartphone className="h-6 w-6" />
                    </div>
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[#D97706]">01</span>
                    </div>
                    <h3 className="font-serif text-2xl font-bold text-[#FAF7F2]">
                    Scan at your table
                  </h3>
                  <p className="text-sm text-[#D1C5B8] leading-relaxed">
                    No app download required. Simply scan the brass QR standee on your dining table using any smartphone camera to open your table&apos;s live menu.
                  </p>
                </Reveal>

                {/* Step 2 */}
                <Reveal delay={0.2} className="p-8 rounded-[var(--radius-xl)] bg-[#3B332E] border border-[var(--ember-border)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-12 w-12 rounded-full bg-[#D97706]/15 flex items-center justify-center text-[#D97706]">
                      <Flame className="h-6 w-6" />
                    </div>
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[#D97706]">02</span>
                    </div>
                    <h3 className="font-serif text-2xl font-bold text-[#FAF7F2]">
                    Order and pay
                  </h3>
                  <p className="text-sm text-[#D1C5B8] leading-relaxed">
                    Filter by veg or spice level, customize modifiers, and settle instantly via UPI, Card, or Pay at Counter with seamless receipt generation.
                  </p>
                </Reveal>

                {/* Step 3 */}
                <Reveal delay={0.3} className="p-8 rounded-[var(--radius-xl)] bg-[#3B332E] border border-[var(--ember-border)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-12 w-12 rounded-full bg-[#D97706]/15 flex items-center justify-center text-[#D97706]">
                      <ChefHat className="h-6 w-6" />
                    </div>
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[#D97706]">03</span>
                    </div>
                    <h3 className="font-serif text-2xl font-bold text-[#FAF7F2]">
                    Track it live
                  </h3>
                  <p className="text-sm text-[#D1C5B8] leading-relaxed">
                    Watch your ticket move through kitchen stations in real-time on our high-contrast display line until your dishes are freshly served.
                  </p>
                </Reveal>
              </div>

              {/* Contactless Dining CTA */}
              <Reveal delay={0.2} className="p-8 sm:p-10 rounded-[var(--radius-xl)] bg-gradient-to-r from-[#211B17] via-[#2E2723] to-[#3B332E] border border-[#D97706]/30 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-1.5 text-center md:text-left">
                  <span className="eyebrow text-[#D97706] font-semibold">Contactless Hospitality</span>
                  <h4 className="font-serif text-2xl font-bold text-[#FAF7F2]">
                    Ready to dine with us?
                  </h4>
                  <p className="text-sm text-[#D1C5B8]">
                    Take your seat at our dining room and scan the table QR code standee to begin.
                  </p>
                </div>
                <Link
                  href="/order"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-md shrink-0 min-h-[44px]"
                >
                  <span>Order at Table</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Reveal>
            </div>
          </section>

          {/* ================================================================ */}
          {/* 05 / VISIT: Address, Hours, Map Placeholder & Intallo Footer */}
          {/* ================================================================ */}
          <section className="py-24 sm:py-32 px-4 sm:px-8 max-w-7xl mx-auto w-full">
            <div className="space-y-16">
              <Reveal className="max-w-2xl space-y-2">
                <span className="eyebrow text-sm sm:text-base md:text-lg font-bold tracking-wider text-[#D97706]">
                  {"05 / Visit & Hours"}
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)]">
                  Reserve a Table or Drop By
                </h2>
                <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                  Located in Indiranagar, Bengaluru. Valet parking and outdoor garden seating available.
                </p>
              </Reveal>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                {/* Information Card (Address & Opening Hours) */}
                <Reveal delay={0.1} className="lg:col-span-5 p-8 rounded-[var(--radius-xl)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] space-y-8 flex flex-col justify-between">
                  <div className="space-y-6">
                    {/* Location */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-[#D97706]">
                        <MapPin className="h-5 w-5" />
                        <span className="eyebrow font-semibold text-[#D97706]">Location</span>
                      </div>
                      <p className="font-serif text-lg font-bold text-[var(--text-primary)]">
                        Masala Lane, Indiranagar
                      </p>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        12th Main Road, HAL 2nd Stage,<br />
                        Indiranagar, Bengaluru, Karnataka 560038
                      </p>
                    </div>

                    <div className="hairline" />

                    {/* Hours */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[#D97706]">
                        <Clock className="h-5 w-5" />
                        <span className="eyebrow font-semibold text-[#D97706]">Service Hours</span>
                      </div>
                      <div className="space-y-2 text-sm text-[var(--text-secondary)] font-mono">
                        <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                          <span>Lunch</span>
                          <span className="font-semibold text-[var(--text-primary)]">12:00 PM – 3:30 PM</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                          <span>Dinner</span>
                          <span className="font-semibold text-[var(--text-primary)]">7:00 PM – 11:30 PM</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Weekend High Tea</span>
                          <span className="font-semibold text-[var(--text-primary)]">4:00 PM – 6:30 PM</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-3">
                    <Link
                      href="/order"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold tracking-wider uppercase transition-all shadow-xs min-h-[44px]"
                    >
                      <span>Order at Table</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <a
                      href="https://maps.google.com/?q=12th+Main+Rd+Indiranagar+Bengaluru"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--bg-subtle)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold tracking-wider uppercase transition-all min-h-[44px]"
                    >
                      <Compass className="h-4 w-4" />
                      <span>Google Maps</span>
                    </a>
                  </div>
                </Reveal>

                {/* Map Placeholder Card */}
                <Reveal delay={0.2} className="lg:col-span-7 rounded-[var(--radius-xl)] overflow-hidden border border-[var(--border-subtle)] bg-[#211B17] relative min-h-[320px] flex flex-col justify-between p-8 text-[#FAF7F2]">
                  {/* Subtle Map Grid Background */}
                  <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: "radial-gradient(#D97706 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1F1A18] via-transparent to-[#1F1A18]/40" />

                  {/* Top Map Eyebrow & Status */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs text-[#FAF7F2]">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="font-mono text-[11px]">Open Today · Tables Available</span>
                    </div>
                    <span className="eyebrow text-[10px] text-[#D97706]">Bengaluru Hub</span>
                  </div>

                  {/* Center Map Pin Graphic */}
                  <div className="relative z-10 my-auto text-center space-y-3 py-8">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#D97706]/20 border border-[#D97706] text-[#D97706] mx-auto shadow-lg animate-pulse">
                      <MapPin className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-serif text-2xl font-bold tracking-tight text-[#FAF7F2]">
                        Masala Lane · Indiranagar
                      </p>
                      <p className="text-xs text-[#D1C5B8] font-mono">
                        12.9719° N, 77.6412° E · 100ft Road Corridor
                      </p>
                    </div>
                  </div>

                  {/* Bottom Map Direction Pill */}
                  <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10 text-xs text-[#D1C5B8]">
                    <span>10 mins from Indiranagar Metro Station</span>
                    <a
                      href="https://maps.google.com/?q=12th+Main+Rd+Indiranagar+Bengaluru"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#D97706] hover:underline font-semibold"
                    >
                      Get Driving Directions &rarr;
                    </a>
                  </div>
                </Reveal>
              </div>

              {/* Concept Preview by Intallo Footer */}
              <div className="pt-16 border-t border-[var(--border-subtle)] space-y-8">
                <Reveal className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
                  <div className="space-y-2">
                    <div className="flex items-center justify-center md:justify-start gap-2">
                      <span className="font-serif text-xl font-bold text-[var(--primary)]">
                        Masala Lane
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">/</span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">DinePulse</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] max-w-lg leading-relaxed">
                      Concept preview engineered by{" "}
                      <a
                        href="https://intallo.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[var(--primary)] hover:underline"
                      >
                        Intallo
                      </a>
                      , a web &amp; automation agency in Bengaluru creating high-performance digital hospitality solutions.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <Link href="/order" className="hover:text-[var(--primary)] transition-colors min-h-[44px] inline-flex items-center">
                      Table Ordering
                    </Link>
                    {kitchenUrl && (
                      <Link href={kitchenUrl} className="hover:text-[var(--primary)] transition-colors min-h-[44px] inline-flex items-center">
                        Kitchen Board
                      </Link>
                    )}
                    {managerUrl && (
                      <Link href={managerUrl} className="hover:text-[var(--primary)] transition-colors min-h-[44px] inline-flex items-center">
                        Manager Admin
                      </Link>
                    )}
                    <a
                      href="https://intallo.in/contact"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#D97706] hover:underline min-h-[44px] inline-flex items-center"
                    >
                      Contact Intallo
                    </a>
                  </div>
                </Reveal>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-mono text-[var(--text-muted)] pt-6 border-t border-[var(--border-subtle)]/50">
                  <p>© 2026 Masala Lane · DinePulse Hospitality Framework.</p>
                  <p>Bengaluru, India · All rights reserved.</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </SmoothScroll>
  );
}
